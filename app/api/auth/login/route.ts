import { NextRequest, NextResponse } from 'next/server';
import { findUserByUsername, verifyPassword, createSession } from '@/lib/auth';

/**
 * POST /api/auth/login
 * 用户登录
 * Body: { username: string, password: string }
 */
export async function POST(request: NextRequest) {
  try {
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

    // 查找用户
    const user = await findUserByUsername(username);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid username or password',
        },
        { status: 401 }
      );
    }

    // 验证密码
    const isValid = await verifyPassword(password, user.password);
    if (!isValid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid username or password',
        },
        { status: 401 }
      );
    }

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

    // Configure cookie for IP-based access (local network)
    // When accessing via IP address (e.g., 192.168.x.x), don't set explicit domain
    response.cookies.set('session', session.token, {
      httpOnly: true,
      secure: false, // Must be false for HTTP (IP addresses typically use HTTP)
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 天
      path: '/',
      // No explicit domain - allows cookie to work with IP addresses
    });

    console.log(`[Login] Set session cookie for user: ${user.username}, token length: ${session.token.length}`);

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to login',
      },
      { status: 500 }
    );
  }
}
