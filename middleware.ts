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
const PUBLIC_PATHS = ['/login', '/init', '/api/auth'];

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

  const isApiRoute = pathname.startsWith('/api/');

  // 从 Cookie 中获取 Session token
  const token = request.cookies.get('session')?.value;

  if (!token) {
    console.log(`[Middleware] No session token for ${pathname}`);
    if (isApiRoute) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    // 验证 Session
    const session = await verifySession(token);

    if (!session) {
      console.log(`[Middleware] Session invalid/expired for ${pathname}`);
      if (isApiRoute) {
        // API routes: return 401 but do NOT delete cookie (could be transient)
        return NextResponse.json({ error: 'Session expired' }, { status: 401 });
      }
      // Page routes: redirect to login and clear cookie
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('from', pathname);
      const response = NextResponse.redirect(loginUrl);
      response.cookies.delete('session');
      return response;
    }

    // Session 有效，允许访问
    return NextResponse.next();
  } catch (error) {
    console.error(`[Middleware] Session verification error for ${pathname}:`, error);
    if (isApiRoute) {
      // API routes: return 500, do NOT delete cookie (transient DB error)
      return NextResponse.json({ error: 'Auth service error' }, { status: 500 });
    }
    // Page routes: redirect to login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete('session');
    return response;
  }
}
