/**
 * Helpers to create NextRequest objects for testing API route handlers.
 *
 * Usage:
 *   const req = makeRequest('GET', '/api/chat', { cookie: 'session=abc' });
 *   const res = await GET(req);
 *   const body = await res.json();
 */
import { NextRequest } from 'next/server';

interface RequestOptions {
  /** Cookie header value, e.g. "session=token123" */
  cookie?: string;
  /** JSON body (for POST/PATCH/PUT) */
  body?: Record<string, unknown>;
  /** Query string params */
  searchParams?: Record<string, string>;
}

/**
 * Build a NextRequest suitable for passing to a Next.js App Router handler.
 */
export function makeRequest(
  method: string,
  pathname: string,
  opts: RequestOptions = {},
): NextRequest {
  const url = new URL(pathname, 'http://localhost:3030');
  if (opts.searchParams) {
    for (const [k, v] of Object.entries(opts.searchParams)) {
      url.searchParams.set(k, v);
    }
  }

  const headers = new Headers();
  if (opts.cookie) {
    headers.set('Cookie', opts.cookie);
  }
  if (opts.body) {
    headers.set('Content-Type', 'application/json');
  }

  return new NextRequest(url, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

/** Shorthand for an authenticated request with a valid session cookie. */
export function authRequest(
  method: string,
  pathname: string,
  opts: Omit<RequestOptions, 'cookie'> = {},
): NextRequest {
  return makeRequest(method, pathname, {
    ...opts,
    cookie: 'session=valid-test-token',
  });
}
