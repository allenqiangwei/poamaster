import { NextRequest, NextResponse } from 'next/server';
import { hasUsers, createUser, createSession } from '@/lib/auth';

/**
 * GET /api/auth/init
 * 检查系统是否已初始化（是否有用户）
 */
export async function GET() {
  try {
    const initialized = await hasUsers();

    return NextResponse.json({
      success: true,
      initialized,
    });
  } catch (error) {
    console.error('Check initialization error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to check initialization status',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auth/init
 * 创建首个用户并自动登录
 * Body: { username: string, password: string }
 */
export async function POST(request: NextRequest) {
  try {
    // 检查系统是否已初始化
    const initialized = await hasUsers();
    if (initialized) {
      return NextResponse.json(
        {
          success: false,
          error: 'System already initialized',
        },
        { status: 400 }
      );
    }

    // 解析请求体
    const body = await request.json();
    const { username, password } = body;

    // 验证输入
    if (!username || !password) {
      return NextResponse.json(
        {
          success: false,
          error: 'Username and password are required',
        },
        { status: 400 }
      );
    }

    // 验证用户名和密码格式
    if (username.length < 3 || username.length > 50) {
      return NextResponse.json(
        {
          success: false,
          error: 'Username must be between 3 and 50 characters',
        },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        {
          success: false,
          error: 'Password must be at least 6 characters',
        },
        { status: 400 }
      );
    }

    // 创建用户
    const user = await createUser(username, password);

    // 创建 Session
    const session = await createSession(user.id);

    // 设置 Cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
      },
    });

    response.cookies.set('session', session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 天
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Init error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to initialize system',
      },
      { status: 500 }
    );
  }
}
