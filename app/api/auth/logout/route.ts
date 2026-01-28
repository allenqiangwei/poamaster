import { NextRequest, NextResponse } from 'next/server';
import { deleteSession } from '@/lib/auth';

/**
 * POST /api/auth/logout
 * 用户登出
 */
export async function POST(request: NextRequest) {
  try {
    // 获取 Session Token
    const token = request.cookies.get('session')?.value;

    if (token) {
      try {
        // 删除 Session
        await deleteSession(token);
      } catch (error) {
        // Session 可能已经不存在，忽略错误
        console.warn('Session deletion failed:', error);
      }
    }

    // 删除 Cookie
    const response = NextResponse.json({
      success: true,
    });

    response.cookies.delete('session');

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to logout',
      },
      { status: 500 }
    );
  }
}
