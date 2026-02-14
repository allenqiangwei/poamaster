/**
 * Sentiment Collector Service — Entry Point
 *
 * Collects app store reviews on a cron schedule,
 * stores them via Prisma, and triggers LLM analysis.
 */

import { PrismaClient } from '@prisma/client';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';
import { registerJob, startScheduler, runNow } from './scheduler.js';

// Resolve paths relative to source file, not cwd
const __dirname = dirname(fileURLToPath(import.meta.url));
export const SERVICE_DIR = resolve(__dirname, '..');        // services/sentiment-collector/
const ROOT_DIR = resolve(SERVICE_DIR, '../..');              // project root

// Load .env from project root (same logic as feishu-listener)
const envPath = join(ROOT_DIR, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
  logger.info(`Loaded env from ${envPath}`);
}

const PID_FILE = join(SERVICE_DIR, '.pid');

// Write PID file for process management
writeFileSync(PID_FILE, String(process.pid));

// Shared Prisma client
export const prisma = new PrismaClient();

// Register collection job
registerJob('collect-reviews', '0 6 * * *', async () => {
  const { collectAllReviews } = await import('./collectors/appstore.js');
  const { collectAllGooglePlayReviews } = await import('./collectors/googleplay.js');

  await collectAllReviews();
  await collectAllGooglePlayReviews();
});

// Start scheduler
startScheduler();

// If --run-now flag is passed, run collection immediately
if (process.argv.includes('--run-now')) {
  runNow('collect-reviews');
}

logger.info(`Sentiment Collector running. PID: ${process.pid}`);
logger.info('Press Ctrl+C to stop.');

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down...`);
  await prisma.$disconnect();

  try {
    unlinkSync(PID_FILE);
  } catch {
    // PID file may already be gone
  }

  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
