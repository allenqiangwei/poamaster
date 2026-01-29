// app/api/insights/upload/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { FileStorage } from '@/lib/insights/storage';
import { FileParser } from '@/lib/insights/parser';
import { FILE_UPLOAD_CONFIG } from '@/lib/insights/constants';
import path from 'path';

const storage = new FileStorage();
const parser = new FileParser();

/**
 * Validates that file extension matches its MIME type
 * @param file - The file to validate
 * @returns true if extension matches MIME type, false otherwise
 */
function validateFileTypeMatch(file: File): boolean {
  const mimeToExtMap: Record<string, string[]> = {
    'text/plain': ['.txt'],
    'application/pdf': ['.pdf'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/jpg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/webp': ['.webp'],
  };

  const allowedExts = mimeToExtMap[file.type];
  if (!allowedExts) {
    return false;
  }

  const ext = path.extname(file.name).toLowerCase();
  return allowedExts.includes(ext);
}

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

    // 3. Validate assigneeId format (should be cuid)
    if (!/^c[a-z0-9]{24}$/.test(assigneeId)) {
      return NextResponse.json(
        { success: false, error: '无效的 assigneeId 格式' },
        { status: 400 }
      );
    }

    // 4. Validate file type
    const allowedTypes = FILE_UPLOAD_CONFIG.ALLOWED_TYPES as readonly string[];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: `不支持的文件类型: ${file.type}` },
        { status: 400 }
      );
    }

    // 5. Validate file extension matches MIME type
    if (!validateFileTypeMatch(file)) {
      return NextResponse.json(
        { success: false, error: '文件扩展名与类型不匹配' },
        { status: 400 }
      );
    }

    // 6. Validate file size
    if (file.size > FILE_UPLOAD_CONFIG.MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `文件过大: 最大支持 ${FILE_UPLOAD_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`,
        },
        { status: 400 }
      );
    }

    // 7. Verify assignee exists
    const assignee = await prisma.assignee.findUnique({
      where: { id: assigneeId },
    });

    if (!assignee) {
      return NextResponse.json(
        { success: false, error: '负责人不存在' },
        { status: 404 }
      );
    }

    // 8. Save file to disk
    const filePath = await storage.saveFile(file, assigneeId);

    let artifactCreated = false;
    try {
      // 9. Parse file to get metadata
      const parseResult = await parser.parse(file);

      // 10. Create Artifact record
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

      artifactCreated = true;

      // 11. Return artifact ID
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
      // Clean up file if database operation failed
      if (!artifactCreated) {
        try {
          await storage.deleteFile(filePath);
        } catch (cleanupError) {
          console.error('Failed to clean up file after error:', cleanupError);
        }
      }
      throw error;
    }
  } catch (error) {
    console.error('Upload error:', error);

    // Provide user-friendly error messages
    let message = '文件上传失败,请稍后重试';

    if (error instanceof Error) {
      if (error.message.includes('Invalid') ||
          error.message.includes('网络连接') ||
          error.message.includes('图片识别失败') ||
          error.message.includes('超时')) {
        message = error.message;
      } else if (error.message.includes('Connection error') ||
                 error.message.includes('ECONNRESET') ||
                 error.message.includes('fetch failed')) {
        message = '网络连接失败。请检查网络连接、代理设置，或稍后重试';
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
