import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractFromReport } from '@/lib/pulse/extractor';
import { FileParser } from '@/lib/insights/parser';
import path from 'path';

export const maxDuration = 300;

// POST /api/pulse/analysis/extract
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reportId, model, selectedPages } = body as {
      reportId?: string;
      model?: string;
      selectedPages?: number[];
    };

    if (!reportId) {
      return NextResponse.json(
        { success: false, error: 'reportId is required' },
        { status: 400 }
      );
    }

    const report = await prisma.pulseReport.findUnique({
      where: { id: reportId },
      include: { project: true }
    });

    if (!report) {
      return NextResponse.json(
        { success: false, error: 'Report not found' },
        { status: 404 }
      );
    }

    let parsedText = report.parsedText;

    // If parsedText is empty and selectedPages provided, parse now (PDF preview flow)
    if (!parsedText && selectedPages && selectedPages.length > 0) {
      const fullPath = path.join(process.cwd(), report.filePath);
      const parser = new FileParser();

      console.log('[Extract] Parsing PDF with selectedPages:', selectedPages);
      const parseResult = await parser.parseFromPath(fullPath, selectedPages);
      parsedText = parseResult.text;

      // Update report with parsed text
      await prisma.pulseReport.update({
        where: { id: reportId },
        data: {
          parsedText,
          parseStatus: parsedText ? 'SUCCESS' : 'FAILED',
          parseError: parsedText ? null : 'Failed to extract text from selected pages',
        }
      });
    }

    if (!parsedText) {
      return NextResponse.json(
        { success: false, error: 'Report has no parsed text' },
        { status: 400 }
      );
    }

    // Fetch existing entries to avoid duplicate extraction
    const existingEntries = await prisma.pulseEntry.findMany({
      where: { projectId: report.projectId, deletedAt: null },
      select: { dimension: true, title: true, evidenceCurrent: true },
    });
    const existingForAI = existingEntries.map(e => ({
      dimension: e.dimension,
      title: e.title,
      evidence: e.evidenceCurrent,
    }));

    const result = await extractFromReport(
      parsedText,
      report.project.name,
      report.reportType,
      report.reportDate.toISOString().split('T')[0],
      report.fileName,
      model || undefined,
      existingForAI
    );

    const session = await prisma.pulseAnalysisSession.create({
      data: {
        reportId,
        aiOutputRaw: result as object,
        status: 'COMPLETED'
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        candidates: result.candidates,
        empty_dimensions: result.empty_dimensions,
        warnings: result.warnings
      }
    }, { status: 201 });
  } catch (error) {
    console.error('AI extraction failed:', error);
    return NextResponse.json(
      { success: false, error: 'AI extraction failed' },
      { status: 500 }
    );
  }
}
