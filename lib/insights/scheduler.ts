import cron, { type ScheduledTask } from 'node-cron';
import { runKeywordGeneration } from './keyword-engine';
import { runCooMemoryPipeline } from '@/lib/coo-memory/scheduler';

let cooMemoryJob: ScheduledTask | null = null;
let keywordGenJob: ScheduledTask | null = null;
let briefingGenJob: ScheduledTask | null = null;

/**
 * Start the nightly insight pipeline scheduler.
 *
 * 22:00 — Generate new keyword combos for all active topics
 * 22:05 — Trigger briefing generation (research + cards + summary)
 *
 * Safe to call multiple times; subsequent calls are no-ops.
 */
export function startScheduler(): void {
  if (keywordGenJob) {
    console.log('[Scheduler] Already running, skipping initialization');
    return;
  }

  // 21:50 — COO memory generation
  cooMemoryJob = cron.schedule('50 21 * * *', async () => {
    console.log('[Scheduler] 21:50 — Starting COO memory pipeline');
    try {
      await runCooMemoryPipeline();
      console.log('[Scheduler] COO memory pipeline complete');
    } catch (error) {
      console.error('[Scheduler] COO memory pipeline failed:', error);
    }
  });

  // 22:00 — keyword generation
  keywordGenJob = cron.schedule('0 22 * * *', async () => {
    console.log('[Scheduler] 22:00 — Starting keyword generation');
    try {
      await runKeywordGeneration();
      console.log('[Scheduler] Keyword generation complete');
    } catch (error) {
      console.error('[Scheduler] Keyword generation failed:', error);
    }
  });

  // 22:05 — briefing generation
  briefingGenJob = cron.schedule('5 22 * * *', async () => {
    console.log('[Scheduler] 22:05 — Starting briefing generation');
    try {
      const response = await fetch(
        `http://localhost:${process.env.PORT || 3030}/api/insights/briefing/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );
      const data = await response.json();
      console.log('[Scheduler] Briefing generation result:', data.success ? 'OK' : data.error);
    } catch (error) {
      console.error('[Scheduler] Briefing generation failed:', error);
    }
  });

  console.log('[Scheduler] Insight pipeline scheduler started (21:50 COO memory, 22:00 keywords, 22:05 briefing)');
}

/**
 * Stop the scheduler. Used for cleanup.
 */
export function stopScheduler(): void {
  if (cooMemoryJob) {
    cooMemoryJob.stop();
    cooMemoryJob = null;
  }
  if (keywordGenJob) {
    keywordGenJob.stop();
    keywordGenJob = null;
  }
  if (briefingGenJob) {
    briefingGenJob.stop();
    briefingGenJob = null;
  }
  console.log('[Scheduler] Stopped');
}
