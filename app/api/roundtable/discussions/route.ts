import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { taskQueue } from '@/lib/roundtable/task-queue';
import { FileProcessor } from '@/lib/roundtable/file-processor';

export async function POST(request: NextRequest) {
  try {
    console.log('[Roundtable] POST /api/roundtable/discussions - Start');

    // 验证 Session
    const token = request.cookies.get('session')?.value;
    if (!token) {
      console.log('[Roundtable] No session token');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session) {
      console.log('[Roundtable] Invalid session');
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    console.log('[Roundtable] Parsing form data...');
    const formData = await request.formData();
    const title = formData.get('title') as string;
    const templateId = formData.get('templateId') as string;
    const materialText = formData.get('materialText') as string || '';
    const files = formData.getAll('files') as File[];

    console.log('[Roundtable] Request data:', {
      title,
      templateId,
      materialTextLength: materialText.length,
      filesCount: files.length,
    });

    if (!title || !templateId) {
      console.log('[Roundtable] Missing required fields');
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 获取OpenAI API Key（使用 getConfig 函数，会自动处理加密和环境变量）
    console.log('[Roundtable] Fetching OpenAI API key...');
    const { getConfig } = await import('@/lib/config');
    const apiKey = await getConfig('openai.apiKey');

    if (!apiKey && !process.env.OPENAI_API_KEY) {
      console.log('[Roundtable] OpenAI API key not configured');
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Please configure it in settings or set OPENAI_API_KEY environment variable.' },
        { status: 500 }
      );
    }

    // 创建讨论记录
    console.log('[Roundtable] Creating discussion record...');
    const discussion = await prisma.roundtableDiscussion.create({
      data: {
        userId: session.user.id,
        templateId,
        title,
        materialText,
        status: 'processing',
      },
    });
    console.log('[Roundtable] Discussion created:', discussion.id);

    // 处理文件上传
    if (files.length > 0) {
      console.log('[Roundtable] Processing files...');
      const fileProcessor = new FileProcessor();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size === 0) {
          console.log(`[Roundtable] Skipping empty file ${i + 1}`);
          continue;
        }

        console.log(`[Roundtable] Processing file ${i + 1}/${files.length}: ${file.name} (${file.size} bytes)`);

        try {
          const result = await fileProcessor.processFile(file, discussion.id);
          console.log(`[Roundtable] File ${i + 1} processed successfully, extracted ${result.extractedText.length} chars`);

          // 保存附件记录
          await prisma.roundtableAttachment.create({
            data: {
              discussionId: discussion.id,
              filename: result.filename,
              filepath: result.filepath,
              filetype: result.filetype,
              filesize: result.filesize,
            },
          });

          // 追加提取的文本到材料
          await prisma.roundtableDiscussion.update({
            where: { id: discussion.id },
            data: {
              materialText: discussion.materialText + '\n\n' + result.extractedText,
            },
          });
        } catch (fileError) {
          console.error(`[Roundtable] Failed to process file ${i + 1}:`, fileError);
          throw fileError; // 重新抛出错误以便外层 catch 处理
        }
      }
      console.log('[Roundtable] All files processed');
    }

    // 加入处理队列
    console.log('[Roundtable] Enqueuing discussion for processing...');
    await taskQueue.enqueue({
      discussionId: discussion.id,
      apiKey: apiKey || process.env.OPENAI_API_KEY!,
    });
    console.log('[Roundtable] Discussion enqueued successfully');

    return NextResponse.json(discussion);
  } catch (error) {
    console.error('[Roundtable] Failed to create discussion:', error);
    if (error instanceof Error) {
      console.error('[Roundtable] Error message:', error.message);
      console.error('[Roundtable] Error stack:', error.stack);
    }
    return NextResponse.json(
      { error: 'Failed to create discussion' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // 验证 Session
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status');
    const templateId = searchParams.get('templateId');

    const where: any = {
      userId: session.user.id,
    };

    if (status) {
      where.status = status;
    }

    if (templateId) {
      where.templateId = templateId;
    }

    const [discussions, total] = await Promise.all([
      prisma.roundtableDiscussion.findMany({
        where,
        include: {
          template: true,
          actions: true,
          risks: { where: { priority: 'high' } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.roundtableDiscussion.count({ where }),
    ]);

    return NextResponse.json({
      discussions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Failed to fetch discussions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch discussions' },
      { status: 500 }
    );
  }
}
