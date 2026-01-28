import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';

/**
 * GET /api/auth/check
 * 检查用户认证状态
 */
export async function GET(request: NextRequest) {
  try {
    // 获取 Session Token
    const token = request.cookies.get('session')?.value;

    if (!token) {
      return NextResponse.json({
        success: true,
        authenticated: false,
        user: null,
      });
    }

    // 验证 Session
    const session = await verifySession(token);

    if (!session) {
      // Session 无效或已过期
      const response = NextResponse.json({
        success: true,
        authenticated: false,
        user: null,
      });

      // 删除无效的 Cookie
      response.cookies.delete('session');

      return response;
    }

    // Session 有效
    const response = NextResponse.json({
      success: true,
      authenticated: true,
      user: {
        id: session.user.id,
        username: session.user.username,
      },
    });

    // 如果 Session 被延长，更新 Cookie
    response.cookies.set('session', session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 天
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Check auth error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to check authentication',
      },
      { status: 500 }
    );
  }
}
