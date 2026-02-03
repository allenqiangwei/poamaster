import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';
import { taskQueue } from '@/lib/roundtable/task-queue';
import { FileProcessor } from '@/lib/roundtable/file-processor';

export async function POST(request: NextRequest) {
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

    const formData = await request.formData();
    const title = formData.get('title') as string;
    const templateId = formData.get('templateId') as string;
    const materialText = formData.get('materialText') as string || '';
    const files = formData.getAll('files') as File[];

    if (!title || !templateId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 获取OpenAI API Key
    const apiKeyConfig = await prisma.config.findUnique({
      where: { key: 'openai_api_key' },
    });

    if (!apiKeyConfig) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    // 创建讨论记录
    const discussion = await prisma.roundtableDiscussion.create({
      data: {
        userId: session.user.id,
        templateId,
        title,
        materialText,
        status: 'processing',
      },
    });

    // 处理文件上传
    if (files.length > 0) {
      const fileProcessor = new FileProcessor(apiKeyConfig.value);

      for (const file of files) {
        if (file.size === 0) continue;

        const result = await fileProcessor.processFile(file, discussion.id);

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
      }
    }

    // 加入处理队列
    await taskQueue.enqueue({
      discussionId: discussion.id,
      apiKey: apiKeyConfig.value,
    });

    return NextResponse.json(discussion);
  } catch (error) {
    console.error('Failed to create discussion:', error);
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
