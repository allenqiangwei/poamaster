import { prisma } from '@/lib/prisma';
import { collectSnapshot } from './collector';
import { generateNarrative } from './narrator';
import { updateCoreMemory } from './core-updater';

/**
 * Run the full COO memory generation pipeline.
 * Called nightly before the insight briefing pipeline.
 *
 * Steps:
 * 1. Collect full-database snapshot
 * 2. Generate narrative + changes + actions via LLM
 * 3. Store episodic memory
 * 4. Update core (semantic) memory
 */
export async function runCooMemoryPipeline(): Promise<void> {
  console.log('[COO Memory] Starting nightly memory pipeline...');

  try {
    // Step 1: Collect snapshot
    console.log('[COO Memory] Step 1: Collecting snapshot...');
    const snapshot = await collectSnapshot();
    console.log(`[COO Memory] Snapshot collected for ${snapshot.date}`);

    // Step 2: Generate narrative, changes, actions
    console.log('[COO Memory] Step 2: Generating narrative...');
    const { narrative, changes, actions } = await generateNarrative(snapshot);
    console.log('[COO Memory] Narrative generated');

    // Step 3: Store episodic memory
    console.log('[COO Memory] Step 3: Storing episodic memory...');
    const todayDate = new Date(snapshot.date);
    await prisma.cooMemoryEpisode.upsert({
      where: { date: todayDate },
      create: {
        date: todayDate,
        snapshot: JSON.stringify(snapshot),
        narrative,
        changes,
        actions,
      },
      update: {
        snapshot: JSON.stringify(snapshot),
        narrative,
        changes,
        actions,
      },
    });
    console.log('[COO Memory] Episodic memory stored');

    // Step 4: Update core memory
    console.log('[COO Memory] Step 4: Updating core memory...');
    await updateCoreMemory(narrative, changes, actions);
    console.log('[COO Memory] Core memory updated');

    console.log('[COO Memory] Nightly pipeline complete');
  } catch (error) {
    console.error('[COO Memory] Pipeline failed:', error);
    throw error;
  }
}
