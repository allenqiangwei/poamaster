import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { sendFeishuTextMessage } from '@/lib/feishu';

/**
 * POST /api/insights/send-to-feishu
 * 发送消息到飞书
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, error: '未授权' },
        { status: 401 }
      );
    }

    const session = await verifySession(token);
    if (!session) {
      return NextResponse.json(
        { success: false, error: '会话无效' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { message } = body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json(
        { success: false, error: '消息内容不能为空' },
        { status: 400 }
      );
    }

    // 发送到飞书
    await sendFeishuTextMessage(message);

    return NextResponse.json({
      success: true,
      message: '已成功发送到飞书',
    });
  } catch (error) {
    console.error('Send to Feishu error:', error);

    let message = '发送失败，请稍后重试';

    if (error instanceof Error) {
      if (error.message.includes('Connection error') ||
          error.message.includes('ECONNRESET') ||
          error.message.includes('fetch failed')) {
        message = '网络连接失败。请检查网络连接、代理设置，或稍后重试';
      } else if (error.message.includes('timeout') ||
                 error.message.includes('timed out')) {
        message = '请求超时。请稍后重试或检查网络连接';
      }
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
