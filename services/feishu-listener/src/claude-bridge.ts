/**
 * Claude CLI bridge for the Feishu listener process.
 * Standalone version of lib/claude-bridge.ts — no Next.js dependencies.
 */

import { spawn } from 'child_process';
import { logger } from './logger.js';

const CLAUDE_PATH = '/opt/homebrew/bin/claude';
const DEFAULT_MODEL = 'sonnet';
const MAX_TURNS = '15';
const TIMEOUT_MS = 180000; // 3 minutes
const MAX_BUFFER = 10 * 1024 * 1024;
const SYSTEM_PROMPT = '你是 POA Master 的 AI 助手，通过飞书与COO对话。直接回答问题，不要使用 AskUserQuestion 工具，不要反问用户。如果信息不足，做出合理假设后直接给出答案。用中文回答。回复尽量简洁（飞书消息不适合太长）。';

export interface ClaudeResponse {
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
  logger.info(`[Claude] subtype: ${parsed.subtype}, turns: ${parsed.num_turns}, cost: $${(parsed.total_cost_usd ?? 0).toFixed(4)}`);

  let result = parsed.result || '';
  if (!result && parsed.subtype === 'error_max_turns') {
    result = '抱歉，这个问题比较复杂，达到了处理限制。请尝试简化问题。';
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
    '--permission-mode', 'bypassPermissions',
  ];

  // Try resume first
  if (sessionId) {
    try {
      const { code, stdout } = await runClaude(['--resume', sessionId, ...baseArgs]);
      if (code === 0) return parseClaudeOutput(stdout);
      logger.warn('[Claude] Resume failed, falling back to new session');
    } catch (err: any) {
      logger.warn(`[Claude] Resume error: ${err.message}`);
    }
  }

  // New session
  const { code, stdout, stderr } = await runClaude(baseArgs);
  if (code !== 0) {
    logger.error(`[Claude] exit code ${code}, stderr: ${stderr.slice(0, 200)}`);
    throw new Error(`Claude CLI exited with code ${code}`);
  }
  return parseClaudeOutput(stdout);
}
