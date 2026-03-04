import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

const UPLOAD_DIR = '/tmp/poa-uploads';
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

/**
 * POST /api/chat/upload
 * Upload files for use in chat. Returns file paths that Claude CLI can read.
 */
export async function POST(req: NextRequest) {
  const token = req.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    await mkdir(UPLOAD_DIR, { recursive: true });

    const uploaded: Array<{ name: string; path: string; size: number }> = [];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `文件 "${file.name}" 超过 20MB 限制` },
          { status: 400 }
        );
      }

      const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
      const safeName = `${randomUUID()}${ext}`;
      const filePath = join(UPLOAD_DIR, safeName);

      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filePath, buffer);

      uploaded.push({
        name: file.name,
        path: filePath,
        size: file.size,
      });
    }

    return NextResponse.json({ success: true, files: uploaded });
  } catch (error: any) {
    console.error('[Upload] Failed:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
