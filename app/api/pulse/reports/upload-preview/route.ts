import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { FileStorage } from '@/lib/insights/storage';
import { FileParser } from '@/lib/insights/parser';
import { ReportType } from '@prisma/client';
import { PULSE_UPLOAD_DIR, MAX_FILE_SIZE } from '@/lib/pulse/constants';
import path from 'path';
import fs from 'fs/promises';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST /api/pulse/reports/upload-preview
// Uploads a PDF, saves it, returns totalPages + thumbnail URLs (no text parsing yet)
export async function POST(request: NextRequest) {
  let filePath: string | null = null;

  try {
    let formData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { success: false, error: '文件解析失败，可能是文件过大。请尝试上传小于 50MB 的文件' },
        { status: 400 }
      );
    }

    const file = formData.get('file') as File | null;
    const projectId = formData.get('projectId') as string | null;
    const reportType = formData.get('reportType') as ReportType | null;
    const reportDate = formData.get('reportDate') as string | null;

    if (!file || !projectId || !reportType || !reportDate) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { success: false, error: '预览功能仅支持 PDF 文件' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `文件大小超过限制（最大 ${MAX_FILE_SIZE / 1024 / 1024}MB）` },
        { status: 400 }
      );
    }

    const project = await prisma.pulseProject.findUnique({
      where: { id: projectId }
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    // Save file to disk
    const storage = new FileStorage(PULSE_UPLOAD_DIR);
    const buffer = Buffer.from(await file.arrayBuffer());
    filePath = await storage.saveFile(buffer, file.name, projectId);

    // Get page count
    const parser = new FileParser();
    const fullPath = path.join(process.cwd(), filePath);
    const totalPages = await parser.getPdfPageCount(fullPath);

    // Create report record with PENDING status (no parsed text yet)
    const report = await prisma.pulseReport.create({
      data: {
        projectId,
        fileName: file.name,
        filePath,
        reportType,
        reportDate: new Date(reportDate),
        parsedText: null,
        parseStatus: 'PENDING',
      }
    });

    // Build thumbnail URLs
    const thumbnails = Array.from({ length: totalPages }, (_, i) => ({
      page: i + 1,
      url: `/api/pulse/reports/${report.id}/thumbnail/${i + 1}`,
    }));

    return NextResponse.json({
      success: true,
      data: {
        reportId: report.id,
        totalPages,
        thumbnails,
      }
    }, { status: 201 });
  } catch (error) {
    console.error('Failed to upload preview:', error);

    if (filePath) {
      try {
        await fs.unlink(path.join(process.cwd(), filePath));
      } catch {
        // Ignore cleanup errors
      }
    }

    return NextResponse.json(
      { success: false, error: 'Failed to process PDF' },
      { status: 500 }
    );
  }
}
