// app/api/insights/extract/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { FileParser } from '@/lib/insights/parser';
import { InsightsExtractor } from '@/lib/insights/extractor';
import { FileStorage } from '@/lib/insights/storage';
import { EXTRACTION_CONFIG } from '@/lib/insights/constants';
import type { DraftItemData } from '@/lib/insights/types';

const parser = new FileParser();
const extractor = new InsightsExtractor();
const storage = new FileStorage();

export async function POST(request: NextRequest) {
  try {
    // 1. Verify session
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Invalid session' },
        { status: 401 }
      );
    }

    // 2. Parse request body
    const body = await request.json();
    const { artifactId, model } = body;

    if (!artifactId || typeof artifactId !== 'string') {
      return NextResponse.json(
        { success: false, error: '缺少或无效的 artifactId 参数' },
        { status: 400 }
      );
    }

    // Model is optional, will use configured default if not provided
    const selectedModel = model || undefined;

    // Validate CUID format
    if (!/^c[a-z0-9]{24}$/.test(artifactId)) {
      return NextResponse.json(
        { success: false, error: '无效的 artifactId 格式' },
        { status: 400 }
      );
    }

    // 3. Fetch artifact from database with assignee validation
    const artifact = await prisma.artifact.findUnique({
      where: { id: artifactId },
      include: { assignee: true },
    });

    if (!artifact) {
      return NextResponse.json(
        { success: false, error: '文件记录不存在' },
        { status: 404 }
      );
    }

    if (!artifact.assignee) {
      return NextResponse.json(
        { success: false, error: '关联的负责人不存在' },
        { status: 404 }
      );
    }

    // 4. Atomically update status to 'extracting' (prevents race condition)
    const updated = await prisma.artifact.updateMany({
      where: {
        id: artifactId,
        status: 'ready'  // Only update if still 'ready'
      },
      data: { status: 'extracting' },
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { success: false, error: '文件已在处理中或状态不正确' },
        { status: 409 }  // Conflict status
      );
    }

    try {
      // 5. Load file from disk
      const fullPath = await storage.getFullPath(artifact.filePath);
      const parseResult = await parser.parseFromPath(fullPath);

      // 6. Extract items using InsightsExtractor
      const extractResult = await extractor.extract(parseResult.text, selectedModel);

      // 7. TODO: Deduplicate items (Task 6 bonus - can skip for MVP)
      // For now, use items as-is
      const items = extractResult.items;

      // 8. Save DraftItems to database
      await prisma.$transaction(async (tx) => {
        // Delete any existing draft items for this artifact (in case of retry)
        await tx.draftItem.deleteMany({
          where: { artifactId },
        });

        // Create new draft items
        if (items.length > 0) {
          await tx.draftItem.createMany({
            data: items.map((item, index) => ({
              artifactId,
              dimension: item.dimension,
              sortOrder: index,
              content: item.content,
              evidence: item.evidence,
              decisionType: item.decisionType,
              action: item.action,
              etaText: item.etaText,
            })),
          });
        }

        // Update artifact status to 'ready' and metadata
        await tx.artifact.update({
          where: { id: artifactId },
          data: {
            status: 'ready',
            modelName: extractResult.metadata.modelName,
            promptVersion: EXTRACTION_CONFIG.PROMPT_VERSION,
            latencyMs: extractResult.metadata.latencyMs,
          },
        });
      });

      // 9. Return success with item counts by dimension
      const itemCounts = items.reduce((acc, item) => {
        acc[item.dimension] = (acc[item.dimension] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return NextResponse.json({
        success: true,
        artifactId,
        itemCount: items.length,
        itemCounts,
        metadata: extractResult.metadata,
      });
    } catch (error) {
      // Update artifact status to 'failed' on error
      await prisma.artifact.update({
        where: { id: artifactId },
        data: {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : '提取失败',
        },
      });

      throw error;
    }
  } catch (error) {
    console.error('Extraction error:', error);

    const message =
      error instanceof Error && error.message.includes('Invalid')
        ? error.message
        : '提取处理失败,请稍后重试';

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
