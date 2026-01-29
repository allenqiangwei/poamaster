/**
 * API utility functions
 * Provides fetch wrapper that always includes credentials for session cookies
 */

/**
 * Fetch wrapper that automatically includes credentials (cookies)
 * Use this instead of fetch() to ensure session cookies are sent
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, {
    ...init,
    credentials: 'include', // Always include cookies
  });
}

/**
 * API fetch with JSON response parsing
 */
export async function apiJson<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const response = await apiFetch(input, init);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }
  return response.json();
}
