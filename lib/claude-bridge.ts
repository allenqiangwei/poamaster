import { spawn } from 'child_process';

const CLAUDE_PATH = '/opt/homebrew/bin/claude';
const DEFAULT_MODEL = 'sonnet';
const MAX_TURNS = '5';
const TIMEOUT_MS = 180000;
const MAX_BUFFER = 10 * 1024 * 1024;

interface ClaudeResponse {
  result: string;
  sessionId: string;
  cost: number;
  durationMs: number;
}

export async function callClaude(
  message: string,
  sessionId?: string | null,
): Promise<ClaudeResponse> {
  const args: string[] = [];

  if (sessionId) {
    args.push('--resume', sessionId);
  }

  args.push(
    '-p', message,
    '--output-format', 'json',
    '--max-turns', MAX_TURNS,
    '--model', DEFAULT_MODEL,
  );

  return new Promise<ClaudeResponse>((resolve, reject) => {
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

      if (code !== 0) {
        console.error('[claude-bridge] exit code:', code);
        if (stderr) console.error('[claude-bridge] stderr:', stderr);
        reject(new Error(`Claude CLI exited with code ${code}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        if (!parsed.result) {
          console.warn('[claude-bridge] Empty result. Full response:', stdout.slice(0, 500));
        }
        resolve({
          result: parsed.result || '',
          sessionId: parsed.session_id,
          cost: parsed.total_cost_usd ?? 0,
          durationMs: parsed.duration_ms ?? 0,
        });
      } catch (parseError) {
        console.error('[claude-bridge] Failed to parse stdout:', stdout.slice(0, 500));
        reject(new Error(`Failed to parse Claude CLI output: ${(parseError as Error).message}`));
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        console.error('[claude-bridge] spawn error:', err.message);
        reject(new Error(`Claude CLI spawn failed: ${err.message}`));
      }
    });
  });
}
