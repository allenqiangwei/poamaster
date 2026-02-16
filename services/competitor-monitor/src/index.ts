/**
 * Competitor Monitor Service — Entry Point
 *
 * Collects competitor app store reviews, website changes, and industry news
 * on a cron schedule, stores them via Prisma, and triggers alerts.
 */

import { PrismaClient } from '@prisma/client';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';
import { registerJob, startScheduler, runNow } from './scheduler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SERVICE_DIR = resolve(__dirname, '..');
const ROOT_DIR = resolve(SERVICE_DIR, '../..');

// Load .env from project root
const envPath = join(ROOT_DIR, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
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
writeFileSync(PID_FILE, String(process.pid));

export const prisma = new PrismaClient();

// Import and init alerter
import { initAlerter } from './alerter.js';
initAlerter(prisma);

// Register collection jobs
registerJob('collect-competitor-reviews', '0 8,20 * * *', async () => {
  const { collectCompetitorReviews } = await import('./collectors/appstore.js');
  await collectCompetitorReviews();
});

registerJob('detect-web-changes', '0 */6 * * *', async () => {
  const { detectWebChanges } = await import('./collectors/webchange.js');
  await detectWebChanges();
});

registerJob('collect-competitor-news', '0 */4 * * *', async () => {
  const { collectCompetitorNews } = await import('./collectors/news.js');
  await collectCompetitorNews();
});

startScheduler();

if (process.argv.includes('--run-now-reviews')) {
  runNow('collect-competitor-reviews');
}
if (process.argv.includes('--run-now-web')) {
  runNow('detect-web-changes');
}
if (process.argv.includes('--run-now-news')) {
  runNow('collect-competitor-news');
}

// SIGUSR1 = trigger immediate collection from web API
let collecting = false;
process.on('SIGUSR1', async () => {
  if (collecting) {
    logger.info('[SIGUSR1] Collection already in progress, ignoring');
    return;
  }
  collecting = true;
  logger.info('[SIGUSR1] Triggered immediate collection');
  try {
    await runNow('collect-competitor-reviews');
    await runNow('detect-web-changes');
    await runNow('collect-competitor-news');
  } finally {
    collecting = false;
  }
});

logger.info(`Competitor Monitor running. PID: ${process.pid}`);
logger.info('Press Ctrl+C to stop.');

async function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down...`);
  await prisma.$disconnect();
  try { unlinkSync(PID_FILE); } catch {}
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
