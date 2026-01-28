import { NextRequest, NextResponse } from 'next/server';
import { getAllConfigs, setConfig, getConfig } from '@/lib/config';

export async function GET() {
  try {
    const configs = await getAllConfigs();
    return NextResponse.json(configs);
  } catch (error) {
    return NextResponse.json(
      { error: '获取配置失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string') {
        await setConfig(key, value);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: '保存配置失败' },
      { status: 500 }
    );
  }
}
