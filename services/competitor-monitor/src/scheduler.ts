import cron from 'node-cron';
import { logger } from './logger.js';

interface Job {
  name: string;
  schedule: string;
  fn: () => Promise<void>;
}

const jobs: Job[] = [];

export function registerJob(name: string, cronSchedule: string, asyncFn: () => Promise<void>) {
  jobs.push({ name, schedule: cronSchedule, fn: asyncFn });
}

export function startScheduler() {
  for (const job of jobs) {
    cron.schedule(job.schedule, async () => {
      logger.info(`[Scheduler] Starting job: ${job.name}`);
      try {
        await job.fn();
        logger.info(`[Scheduler] Completed job: ${job.name}`);
      } catch (error: any) {
        logger.error(`[Scheduler] Job ${job.name} failed:`, error.message);
      }
    });
    logger.info(`[Scheduler] Registered job: ${job.name} (${job.schedule})`);
  }
}

export async function runNow(name: string) {
  const job = jobs.find(j => j.name === name);
  if (!job) {
    logger.error(`[Scheduler] Job not found: ${name}`);
    return;
  }
  logger.info(`[Scheduler] Running job immediately: ${name}`);
  try {
    await job.fn();
    logger.info(`[Scheduler] Completed job: ${name}`);
  } catch (error: any) {
    logger.error(`[Scheduler] Job ${name} failed:`, error.message);
  }
}
