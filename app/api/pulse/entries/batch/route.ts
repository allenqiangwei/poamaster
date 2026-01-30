import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateEmbedding } from '@/lib/pulse/similarity';
import { BatchOperation } from '@/lib/pulse/types';

// POST /api/pulse/entries/batch
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, sessionId, operations } = body as {
      projectId: string;
      sessionId: string;
      operations: BatchOperation[];
    };

    if (!projectId || !operations || !Array.isArray(operations)) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    let created = 0;
    let updated = 0;
    let ignored = 0;

    await prisma.$transaction(async (tx) => {
      for (const op of operations) {
        if (op.action === 'ignore') {
          ignored++;
          continue;
        }

        const text = op.title + ' ' + op.evidence;
        const embedding = await generateEmbedding(text);

        if (op.action === 'create') {
          await tx.pulseEntry.create({
            data: {
              projectId,
              dimension: op.dimension,
              title: op.title.trim(),
              evidenceCurrent: op.evidence.trim(),
              sourceCurrent: {
                reportType: op.source.reportType,
                reportDate: op.source.reportDate,
                fileName: op.source.fileName,
                ...(op.source.page !== undefined && { page: op.source.page })
              },
              evidenceHistory: [],
              embedding
            }
          });
          created++;
        } else if (op.action === 'update' && op.targetEntryId) {
          const existing = await tx.pulseEntry.findUnique({
            where: { id: op.targetEntryId }
          });

          if (existing) {
            const historyItem = {
              evidence: existing.evidenceCurrent,
              source: existing.sourceCurrent,
              addedAt: new Date().toISOString()
            };

            const currentHistory = (existing.evidenceHistory as unknown[]) || [];

            const updateData: Record<string, unknown> = {
              title: op.title.trim(),
              evidenceCurrent: op.evidence.trim(),
              sourceCurrent: op.source,
              evidenceHistory: [...currentHistory, historyItem],
              embedding
            };

            await tx.pulseEntry.update({
              where: { id: op.targetEntryId },
              data: updateData
            });
            updated++;
          }
        }
      }

      await tx.pulseProject.update({
        where: { id: projectId },
        data: { updatedAt: new Date() }
      });
    });

    const project = await prisma.pulseProject.findUnique({
      where: { id: projectId }
    });

    return NextResponse.json({
      success: true,
      data: {
        created,
        updated,
        ignored,
        projectUpdatedAt: project?.updatedAt.toISOString()
      }
    });
  } catch (error) {
    console.error('Batch commit failed:', error);
    return NextResponse.json(
      { success: false, error: 'Batch commit failed' },
      { status: 500 }
    );
  }
}
