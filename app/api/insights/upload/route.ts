// app/api/insights/upload/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { FileStorage } from '@/lib/insights/storage';
import { FileParser } from '@/lib/insights/parser';
import { FILE_UPLOAD_CONFIG } from '@/lib/insights/constants';

const storage = new FileStorage();
const parser = new FileParser();

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

    // 2. Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const assigneeId = formData.get('assigneeId') as string;

    if (!file || !assigneeId) {
      return NextResponse.json(
        { success: false, error: '缺少必需参数: file 和 assigneeId' },
        { status: 400 }
      );
    }

    // 3. Validate file type
    const allowedTypes = FILE_UPLOAD_CONFIG.ALLOWED_TYPES as readonly string[];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: `不支持的文件类型: ${file.type}` },
        { status: 400 }
      );
    }

    // 4. Validate file size
    if (file.size > FILE_UPLOAD_CONFIG.MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `文件过大: 最大支持 ${FILE_UPLOAD_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`,
        },
        { status: 400 }
      );
    }

    // 5. Verify assignee exists
    const assignee = await prisma.assignee.findUnique({
      where: { id: assigneeId },
    });

    if (!assignee) {
      return NextResponse.json(
        { success: false, error: '负责人不存在' },
        { status: 404 }
      );
    }

    // 6. Save file to disk
    const filePath = await storage.saveFile(file, assigneeId);

    // 7. Parse file to get metadata
    const parseResult = await parser.parse(file);

    // 8. Create Artifact record
    const artifact = await prisma.artifact.create({
      data: {
        assigneeId,
        fileName: file.name,
        fileType: parseResult.metadata.fileType,
        filePath,
        charCount: parseResult.charCount,
        pageCount: parseResult.pageCount,
        status: 'ready', // File uploaded and parsed, ready for extraction
      },
    });

    // 9. Return artifact ID
    return NextResponse.json({
      success: true,
      artifactId: artifact.id,
      metadata: {
        fileName: file.name,
        fileType: parseResult.metadata.fileType,
        charCount: parseResult.charCount,
        pageCount: parseResult.pageCount,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '文件上传失败',
      },
      { status: 500 }
    );
  }
}
