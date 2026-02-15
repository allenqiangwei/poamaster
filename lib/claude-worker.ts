import { spawn, ChildProcess } from 'child_process';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CLAUDE_PATH = '/opt/homebrew/bin/claude';
const DEFAULT_MODEL = 'sonnet';
const MAX_TURNS = '15';
const TIMEOUT_MS = 300000; // 5 minutes
const SYSTEM_PROMPT =
  '你是 POA Master 的 AI 助手。直接回答用户的问题，不要使用 AskUserQuestion 工具，不要反问用户。如果信息不足，做出合理假设后直接给出答案。用中文回答。';

// ---------------------------------------------------------------------------
// Progress mapping: tool_use name → Chinese description
// ---------------------------------------------------------------------------
const TOOL_PROGRESS: Record<string, string> = {
  Read: '正在读取文件...',
  Grep: '正在搜索代码...',
  Bash: '正在执行命令...',
  Write: '正在编辑文件...',
  Edit: '正在编辑文件...',
  Glob: '正在查找文件...',
  WebSearch: '正在搜索网络...',
  WebFetch: '正在获取网页...',
  Task: '正在执行子任务...',
};

// Active jobs keyed by messageId
const activeJobs = new Map<string, ChildProcess>();

// ---------------------------------------------------------------------------
// startClaudeJob — fire-and-forget
// ---------------------------------------------------------------------------
export function startClaudeJob(
  messageId: string,
  prompt: string,
  claudeSessionId?: string | null,
): void {
  // Run the async work but don't await it — caller gets control back immediately
  processJob(messageId, prompt, claudeSessionId).catch((err) => {
    console.error(`[claude-worker] Unhandled error for message ${messageId}:`, err);
  });
}

// ---------------------------------------------------------------------------
// cancelJob — kill an active child process
// ---------------------------------------------------------------------------
export function cancelJob(messageId: string): boolean {
  const child = activeJobs.get(messageId);
  if (!child) return false;

  try {
    child.kill('SIGKILL');
  } catch {
    // process may already be dead
  }
  activeJobs.delete(messageId);
  return true;
}

// ---------------------------------------------------------------------------
// cleanupOrphanedJobs — find messages stuck in processing >5min, mark error
// ---------------------------------------------------------------------------
export async function cleanupOrphanedJobs(): Promise<number> {
  const fiveMinutesAgo = new Date(Date.now() - TIMEOUT_MS);
  const orphaned = await prisma.botMessage.updateMany({
    where: {
      status: 'processing',
      updatedAt: { lt: fiveMinutesAgo },
    },
    data: {
      status: 'error',
      errorMessage: '处理超时，请重试。',
    },
  });
  if (orphaned.count > 0) {
    console.log(`[claude-worker] Cleaned up ${orphaned.count} orphaned job(s)`);
  }
  return orphaned.count;
}

// Run cleanup on module load
cleanupOrphanedJobs().catch((err) => {
  console.error('[claude-worker] Orphan cleanup failed:', err);
});

// ---------------------------------------------------------------------------
// processJob — the core async worker
// ---------------------------------------------------------------------------
async function processJob(
  messageId: string,
  prompt: string,
  claudeSessionId?: string | null,
): Promise<void> {
  // 1. Mark message as processing
  await prisma.botMessage.update({
    where: { id: messageId },
    data: { status: 'processing', progress: '正在思考...' },
  });

  // 2. Build CLI args
  const baseArgs = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--max-turns', MAX_TURNS,
    '--model', DEFAULT_MODEL,
    '--append-system-prompt', SYSTEM_PROMPT,
    '--permission-mode', 'bypassPermissions',
  ];

  // Try resume if we have a session; on failure fall back to new session
  const attempts: string[][] = [];
  if (claudeSessionId) {
    attempts.push(['--resume', claudeSessionId, ...baseArgs]);
  }
  attempts.push(baseArgs);

  let lastError: Error | null = null;

  for (const args of attempts) {
    try {
      await runStreamingClaude(messageId, args);
      return; // success — stop trying
    } catch (err: any) {
      lastError = err;
      const isResume = args.includes('--resume');
      if (isResume) {
        console.warn(`[claude-worker] Resume failed for ${messageId}: ${err.message}. Retrying without resume.`);
        continue; // try without resume
      }
      // Non-resume attempt failed — propagate
      break;
    }
  }

  // All attempts failed
  console.error(`[claude-worker] All attempts failed for ${messageId}:`, lastError);
  await prisma.botMessage.update({
    where: { id: messageId },
    data: {
      status: 'error',
      errorMessage: lastError?.message || 'Claude CLI 调用失败',
      progress: null,
    },
  });
}

// ---------------------------------------------------------------------------
// runStreamingClaude — spawn the CLI and parse stream-json lines
// ---------------------------------------------------------------------------
function runStreamingClaude(messageId: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_PATH, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    activeJobs.set(messageId, child);

    let stderrBuf = '';
    let lineBuf = '';
    let settled = false;
    let resultText = '';
    let sessionId: string | undefined;
    let cost = 0;

    // Timeout guard
    const timer = setTimeout(async () => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch {}
      activeJobs.delete(messageId);
      await prisma.botMessage.update({
        where: { id: messageId },
        data: {
          status: 'error',
          errorMessage: '处理超时（5分钟），请重试。',
          progress: null,
        },
      }).catch(() => {});
      reject(new Error('Claude CLI timed out'));
    }, TIMEOUT_MS);

    // Parse each JSON line from stdout
    child.stdout!.on('data', (chunk: Buffer) => {
      lineBuf += chunk.toString();
      const lines = lineBuf.split('\n');
      lineBuf = lines.pop() || ''; // keep incomplete last line in buffer

      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        try {
          const event = JSON.parse(line);
          handleStreamEvent(messageId, event).catch((e) => {
            console.error('[claude-worker] Error handling stream event:', e);
          });

          // Capture final result
          if (event.type === 'result') {
            resultText = event.result || '';
            sessionId = event.session_id;
            cost = event.total_cost_usd ?? 0;

            // Handle error_max_turns
            if (event.subtype === 'error_max_turns' && !resultText) {
              resultText = '抱歉，这个问题比较复杂，我在处理过程中达到了回合数限制。请尝试简化问题或拆分成多个小问题。';
            }
          }
        } catch {
          // Not valid JSON — skip (could be CLI debug output)
        }
      }
    });

    child.stderr!.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });

    child.on('close', async (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      activeJobs.delete(messageId);

      try {
        if (code !== 0 && !resultText) {
          console.error(`[claude-worker] CLI exited ${code} for ${messageId}`);
          if (stderrBuf) console.error('[claude-worker] stderr:', stderrBuf.slice(0, 500));
          await prisma.botMessage.update({
            where: { id: messageId },
            data: {
              status: 'error',
              errorMessage: `Claude CLI 退出码 ${code}`,
              progress: null,
            },
          });
          reject(new Error(`Claude CLI exited with code ${code}`));
          return;
        }

        // Success — update message and conversation
        const message = await prisma.botMessage.update({
          where: { id: messageId },
          data: {
            content: resultText || null,
            status: 'done',
            progress: null,
            unread: true,
          },
        });

        // Update conversation metadata
        await prisma.botConversation.update({
          where: { id: message.conversationId },
          data: {
            hasUnread: true,
            ...(sessionId ? { claudeSessionId: sessionId } : {}),
          },
        });

        console.log(
          `[claude-worker] Job done for ${messageId} — cost: $${cost.toFixed(4)}, session: ${sessionId ?? 'n/a'}, len: ${(resultText || '').length}`,
        );
        resolve();
      } catch (dbErr) {
        console.error(`[claude-worker] DB error on completion for ${messageId}:`, dbErr);
        reject(dbErr);
      }
    });

    child.on('error', async (err) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      activeJobs.delete(messageId);

      await prisma.botMessage.update({
        where: { id: messageId },
        data: {
          status: 'error',
          errorMessage: `Claude CLI 启动失败: ${err.message}`,
          progress: null,
        },
      }).catch(() => {});
      reject(new Error(`Claude CLI spawn failed: ${err.message}`));
    });
  });
}

// ---------------------------------------------------------------------------
// handleStreamEvent — update progress in DB based on stream-json events
// ---------------------------------------------------------------------------
async function handleStreamEvent(messageId: string, event: any): Promise<void> {
  // Skip system events (init, hook_started, etc.)
  if (event.type === 'system') return;

  // Skip result events — handled in the close handler
  if (event.type === 'result') return;

  // Parse assistant messages for tool_use progress
  if (event.type === 'assistant' && event.message?.content) {
    const contents: any[] = event.message.content;
    let progress: string | null = null;

    for (const block of contents) {
      if (block.type === 'tool_use' && block.name) {
        progress = TOOL_PROGRESS[block.name] || `正在使用 ${block.name}...`;
        break; // use the first tool_use found
      }
    }

    // If no tool_use blocks, it's just text thinking
    if (!progress) {
      progress = '正在思考...';
    }

    await prisma.botMessage.update({
      where: { id: messageId },
      data: { progress },
    });
  }
}
