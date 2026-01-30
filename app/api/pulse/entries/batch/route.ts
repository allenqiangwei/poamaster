import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateEmbedding } from '@/lib/pulse/similarity';
import { Source, AICandidate } from '@/lib/pulse/types';

interface FrontendOperation {
  action: 'create' | 'update' | 'ignore';
  candidate: AICandidate & { title: string };
  updateTargetId?: string | null;
}

// POST /api/pulse/entries/batch
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, source, operations } = body as {
      projectId: string;
      source: Source;
      operations: FrontendOperation[];
    };

    if (!projectId || !source || !operations || !Array.isArray(operations)) {
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

        const { candidate, updateTargetId } = op;
        const title = candidate.title;
        const evidence = candidate.evidence_quote;
        const dimension = candidate.dimension;

        const text = title + ' ' + evidence;
        const embedding = await generateEmbedding(text);

        if (op.action === 'create') {
          await tx.pulseEntry.create({
            data: {
              projectId,
              dimension,
              title: title.trim(),
              evidenceCurrent: evidence.trim(),
              sourceCurrent: {
                reportType: source.reportType,
                reportDate: source.reportDate,
                fileName: source.fileName,
                ...(source.page !== undefined && { page: source.page })
              },
              evidenceHistory: [],
              embedding
            }
          });
          created++;
        } else if (op.action === 'update' && updateTargetId) {
          const existing = await tx.pulseEntry.findUnique({
            where: { id: updateTargetId }
          });

          if (existing) {
            const historyItem = {
              evidence: existing.evidenceCurrent,
              source: existing.sourceCurrent,
              addedAt: new Date().toISOString()
            };

            const currentHistory = (existing.evidenceHistory as unknown[]) || [];

            const updateData: Record<string, unknown> = {
              title: title.trim(),
              evidenceCurrent: evidence.trim(),
              sourceCurrent: source,
              evidenceHistory: [...currentHistory, historyItem],
              embedding
            };

            await tx.pulseEntry.update({
              where: { id: updateTargetId },
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
    }, {
      timeout: 60000 // 增加超时到 60 秒，处理大批量 embedding 生成
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
