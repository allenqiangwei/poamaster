import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { FileStorage } from '@/lib/insights/storage';
import { FileParser } from '@/lib/insights/parser';
import { ReportType } from '@prisma/client';
import { PULSE_UPLOAD_DIR, MAX_FILE_SIZE, ALLOWED_MIME_TYPES } from '@/lib/pulse/constants';
import path from 'path';
import fs from 'fs/promises';

// POST /api/pulse/reports/upload
// Note: Body size limit is configured in next.config.js (serverActions.bodySizeLimit)
export async function POST(request: NextRequest) {
  let filePath: string | null = null;

  try {
    let formData;
    try {
      formData = await request.formData();
    } catch (formDataError) {
      // 捕获 FormData 解析错误（通常是文件太大）
      console.error('FormData parsing error:', formDataError);
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

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: '只支持 PDF 和文本文件' },
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

    const storage = new FileStorage(PULSE_UPLOAD_DIR);
    const buffer = Buffer.from(await file.arrayBuffer());
    filePath = await storage.saveFile(buffer, file.name, projectId);

    const parser = new FileParser();
    const fullPath = path.join(process.cwd(), filePath);

    console.log('[Upload] Parsing file:', { fileName: file.name, fileType: file.type, fullPath });

    let parseResult;
    try {
      parseResult = await parser.parseFromPath(fullPath);
      console.log('[Upload] Parse result:', {
        textLength: parseResult.text?.length || 0,
        charCount: parseResult.charCount,
        hasText: !!parseResult.text
      });
    } catch (parseError) {
      console.error('[Upload] Parse error:', parseError);
      // 继续创建报告但标记为失败
      parseResult = {
        text: '',
        charCount: 0,
        metadata: { fileType: 'unknown', fileName: file.name }
      };
    }

    if (!parseResult.text || parseResult.text.trim().length === 0) {
      console.error('[Upload] Parse failed - no text extracted from file:', file.name);
    }

    const report = await prisma.pulseReport.create({
      data: {
        projectId,
        fileName: file.name,
        filePath,
        reportType,
        reportDate: new Date(reportDate),
        parsedText: parseResult.text,
        parseStatus: parseResult.text ? 'SUCCESS' : 'FAILED',
        parseError: parseResult.text ? null : 'Failed to extract text from file'
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
