import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import path from 'path';
import fs from 'fs/promises';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const THUMBNAIL_WIDTH = 300;

// GET /api/pulse/reports/[reportId]/thumbnail/[page]
// Renders a single PDF page as a thumbnail image
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ reportId: string; page: string }> }
) {
  try {
    const { reportId, page: pageStr } = await params;
    const pageNum = parseInt(pageStr, 10);

    if (isNaN(pageNum) || pageNum < 1) {
      return NextResponse.json(
        { success: false, error: 'Invalid page number' },
        { status: 400 }
      );
    }

    const report = await prisma.pulseReport.findUnique({
      where: { id: reportId },
      select: { filePath: true }
    });

    if (!report || !report.filePath) {
      return NextResponse.json(
        { success: false, error: 'Report not found' },
        { status: 404 }
      );
    }

    const fullPath = path.join(process.cwd(), report.filePath);

    // Check file exists
    try {
      await fs.access(fullPath);
    } catch {
      return NextResponse.json(
        { success: false, error: 'PDF file not found on disk' },
        { status: 404 }
      );
    }

    // Use sharp to render PDF page directly (sharp uses libvips which supports PDF)
    // Page index is 0-based in sharp
    const sharp = (await import('sharp')).default;

    let thumbnail: Buffer;
    try {
      thumbnail = await sharp(fullPath, { page: pageNum - 1, density: 150 })
        .resize({ width: THUMBNAIL_WIDTH })
        .png()
        .toBuffer();
    } catch (sharpError: unknown) {
      // If sharp can't render PDF (missing poppler/libvips PDF support),
      // return a placeholder with page number text
      console.error(`[Thumbnail] sharp PDF render failed for page ${pageNum}:`, sharpError);
      return NextResponse.json(
        { success: false, error: 'PDF thumbnail rendering not supported. Install poppler for PDF support.' },
        { status: 500 }
      );
    }

    return new NextResponse(new Uint8Array(thumbnail), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, max-age=3600',
      }
    });
  } catch (error) {
    console.error('Failed to generate thumbnail:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate thumbnail' },
      { status: 500 }
    );
  }
}
