import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { FileStorage } from '@/lib/insights/storage';
import { FileParser } from '@/lib/insights/parser';
import { ReportType } from '@prisma/client';
import { PULSE_UPLOAD_DIR, MAX_FILE_SIZE, ALLOWED_MIME_TYPES } from '@/lib/pulse/constants';
import path from 'path';
import fs from 'fs/promises';

// POST /api/pulse/reports/upload
export async function POST(request: NextRequest) {
  let filePath: string | null = null;

  try {
    const formData = await request.formData();
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

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Only PDF files are allowed' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File size exceeds 10MB limit' },
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

    const storage = new FileStorage(PULSE_UPLOAD_DIR);
    const buffer = Buffer.from(await file.arrayBuffer());
    filePath = await storage.saveFile(buffer, file.name, projectId);

    const parser = new FileParser();
    const fullPath = path.join(process.cwd(), filePath);
    const parseResult = await parser.parseFromPath(fullPath);

    const report = await prisma.pulseReport.create({
      data: {
        projectId,
        fileName: file.name,
        filePath,
        reportType,
        reportDate: new Date(reportDate),
        parsedText: parseResult.text,
        parseStatus: parseResult.text ? 'SUCCESS' : 'FAILED',
        parseError: parseResult.text ? null : 'Failed to extract text from PDF'
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        id: report.id,
        fileName: report.fileName,
        parseStatus: report.parseStatus,
        parsedText: report.parsedText,
        charCount: parseResult.charCount
      }
    }, { status: 201 });
  } catch (error) {
    console.error('Failed to upload report:', error);

    if (filePath) {
      try {
        await fs.unlink(path.join(process.cwd(), filePath));
      } catch {
        // Ignore cleanup errors
      }
    }

    return NextResponse.json(
      { success: false, error: 'Failed to upload report' },
      { status: 500 }
    );
  }
}
