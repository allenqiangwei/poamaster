import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth';

/**
 * 认证中间件
 * 保护所有非公开路径，验证 Session token
 */

// 使用 Node.js runtime 而非 Edge Runtime（因为需要 crypto 模块）
export const runtime = 'nodejs';

// 公开路径（无需认证）
const PUBLIC_PATHS = ['/login', '/init', '/api/auth', '/api/sentiment/analyze'];

// 静态资源路径（通过 matcher 配置排除）
export const config = {
  matcher: [
    /*
     * 匹配所有路径，除了：
     * - _next/static (静态文件)
     * - _next/image (图片优化文件)
     * - favicon.ico (网站图标)
     * - public 目录下的文件 (公共资源)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 检查是否为公开路径
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (isPublicPath) {
    return NextResponse.next();
  }

  // 从 Cookie 中获取 Session token
  const token = request.cookies.get('session')?.value;

  // Debug logging
  const allCookies = request.cookies.getAll();
  console.log(`[Middleware] ${pathname} - Cookies received: ${allCookies.map(c => c.name).join(', ') || 'none'}`);

  if (!token) {
    // 未登录，重定向到登录页
    console.log(`[Middleware] No session token for ${pathname}, redirecting to login`);
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  console.log(`[Middleware] Session token found for ${pathname}`);

  try {
    // 验证 Session
    const session = await verifySession(token);

    if (!session) {
      // Session 无效或已过期，重定向到登录页
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('from', pathname);
      const response = NextResponse.redirect(loginUrl);

      // 清除无效的 Session Cookie
      response.cookies.delete('session');

      return response;
    }

    // Session 有效，允许访问
    return NextResponse.next();
  } catch (error) {
    // 验证出错，重定向到登录页
    console.error('Session verification error:', error);
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    const response = NextResponse.redirect(loginUrl);

    // 清除可能损坏的 Session Cookie
    response.cookies.delete('session');

    return response;
  }
}
