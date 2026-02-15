import { execFile } from 'child_process';

const CLAUDE_PATH = '/opt/homebrew/bin/claude';
const DEFAULT_MODEL = 'sonnet';
const MAX_TURNS = '5';
const TIMEOUT_MS = 120000;
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
    execFile(
      CLAUDE_PATH,
      args,
      { timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER },
      (error, stdout, stderr) => {
        if (error) {
          console.error('[claude-bridge] execFile error:', error.message);
          if (stderr) {
            console.error('[claude-bridge] stderr:', stderr);
          }
          reject(new Error(`Claude CLI failed: ${error.message}`));
          return;
        }

        try {
          const parsed = JSON.parse(stdout);
          resolve({
            result: parsed.result,
            sessionId: parsed.session_id,
            cost: parsed.total_cost_usd,
            durationMs: parsed.duration_ms,
          });
        } catch (parseError) {
          console.error(
            '[claude-bridge] Failed to parse stdout:',
            stdout.slice(0, 500),
          );
          reject(
            new Error(
              `Failed to parse Claude CLI output: ${(parseError as Error).message}`,
            ),
          );
        }
      },
    );
  });
}
