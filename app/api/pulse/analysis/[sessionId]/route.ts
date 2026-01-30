import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface Params {
  params: Promise<{ sessionId: string }>;
}

// GET /api/pulse/analysis/[sessionId]
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { sessionId } = await params;

    const session = await prisma.pulseAnalysisSession.findUnique({
      where: { id: sessionId },
      include: {
        report: {
          select: {
            projectId: true,
            fileName: true,
            reportType: true,
            reportDate: true,
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: session });
  } catch (error) {
    console.error('Failed to fetch session:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch session' },
      { status: 500 }
    );
  }
}
