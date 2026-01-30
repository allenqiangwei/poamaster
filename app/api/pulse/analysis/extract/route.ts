import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractFromReport } from '@/lib/pulse/extractor';

// POST /api/pulse/analysis/extract
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reportId } = body;

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

    if (!report.parsedText) {
      return NextResponse.json(
        { success: false, error: 'Report has no parsed text' },
        { status: 400 }
      );
    }

    const result = await extractFromReport(
      report.parsedText,
      report.project.name,
      report.reportType,
      report.reportDate.toISOString().split('T')[0],
      report.fileName
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
