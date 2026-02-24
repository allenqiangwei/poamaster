import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';
import { runCooMemoryPipeline } from '@/lib/coo-memory/scheduler';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('session')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const session = await verifySession(token);
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

    await runCooMemoryPipeline();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[COO API] Memory generation failed:', error);
    const message = error?.message || 'Unknown error';
    // Surface specific errors to the frontend
    if (message.includes('API Key')) {
      return NextResponse.json({ error: 'OpenAI API Key 未配置，请在设置页面配置' }, { status: 500 });
    }
    if (message.includes('Connection error') || message.includes('fetch failed') || message.includes('ECONNRESET')) {
      return NextResponse.json({ error: '连接 OpenAI 失败，请检查网络或代理设置' }, { status: 500 });
    }
    if (message.includes('timeout') || message.includes('timed out')) {
      return NextResponse.json({ error: 'OpenAI 请求超时，请稍后重试' }, { status: 500 });
    }
    if (message.includes('model') || message.includes('404')) {
      return NextResponse.json({ error: `模型不可用: ${message}` }, { status: 500 });
    }
    return NextResponse.json({ error: `生成失败: ${message}` }, { status: 500 });
  }
}
