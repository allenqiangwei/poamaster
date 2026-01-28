import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/auth/check-init
 * 检查系统是否已初始化（是否有用户存在）
 * 无需认证
 */
export async function GET() {
  try {
    const userCount = await prisma.user.count();

    return NextResponse.json({
      initialized: userCount > 0,
    });
  } catch (error) {
    console.error('Check init error:', error);
    return NextResponse.json(
      { error: 'Failed to check initialization status' },
      { status: 500 }
    );
  }
}
