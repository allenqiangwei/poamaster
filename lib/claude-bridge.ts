import { spawn } from 'child_process';

const CLAUDE_PATH = '/opt/homebrew/bin/claude';
const DEFAULT_MODEL = 'sonnet';
const MAX_TURNS = '15';
const TIMEOUT_MS = 180000;
const MAX_BUFFER = 10 * 1024 * 1024;
const SYSTEM_PROMPT = '你是 POA Master 的 AI 助手。直接回答用户的问题，不要使用 AskUserQuestion 工具，不要反问用户。如果信息不足，做出合理假设后直接给出答案。用中文回答。';

interface ClaudeResponse {
  result: string;
  sessionId: string;
  cost: number;
  durationMs: number;
}

function runClaude(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_PATH, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > MAX_BUFFER) {
        child.kill('SIGKILL');
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill('SIGKILL');
        reject(new Error('Claude CLI timed out'));
      }
    }, TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolve({ code, stdout, stderr });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(new Error(`Claude CLI spawn failed: ${err.message}`));
      }
    });
  });
}

function parseClaudeOutput(stdout: string): ClaudeResponse {
  const parsed = JSON.parse(stdout);
  console.log('[claude-bridge] subtype:', parsed.subtype, 'turns:', parsed.num_turns, 'cost: $' + (parsed.total_cost_usd ?? 0).toFixed(4), 'result_len:', (parsed.result || '').length);
  let result = parsed.result || '';
  if (!result && parsed.subtype === 'error_max_turns') {
    console.warn('[claude-bridge] Hit max turns limit. Turns:', parsed.num_turns);
    result = '抱歉，这个问题比较复杂，我在处理过程中达到了回合数限制。请尝试简化问题或拆分成多个小问题。';
  } else if (!result) {
    console.warn('[claude-bridge] Empty result! Full stdout:', stdout.slice(0, 1000));
  }
  return {
    result,
    sessionId: parsed.session_id,
    cost: parsed.total_cost_usd ?? 0,
    durationMs: parsed.duration_ms ?? 0,
  };
}

export async function callClaude(
  message: string,
  sessionId?: string | null,
): Promise<ClaudeResponse> {
  const baseArgs = [
    '-p', message,
    '--output-format', 'json',
    '--max-turns', MAX_TURNS,
    '--model', DEFAULT_MODEL,
    '--append-system-prompt', SYSTEM_PROMPT,
  ];

  // If resuming a session, try with --resume first
  if (sessionId) {
    const resumeArgs = ['--resume', sessionId, ...baseArgs];
    try {
      const { code, stdout, stderr } = await runClaude(resumeArgs);
      if (code !== 0) {
        console.warn('[claude-bridge] Resume failed (code ' + code + '), falling back to new session');
      } else {
        return parseClaudeOutput(stdout);
      }
    } catch (err: any) {
      console.warn('[claude-bridge] Resume timed out or failed:', err.message, '— retrying without resume');
    }
  }

  // New session (or fallback after resume failure)
  const { code, stdout, stderr } = await runClaude(baseArgs);
  if (code !== 0) {
    console.error('[claude-bridge] exit code:', code);
    if (stderr) console.error('[claude-bridge] stderr:', stderr);
    throw new Error(`Claude CLI exited with code ${code}`);
  }
  return parseClaudeOutput(stdout);
}
