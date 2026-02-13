import { createHash } from 'crypto';
import { logger } from './logger.js';

// Feishu API endpoints
const CSRF_TOKEN_URL = 'https://internal-api-lark-api.feishu.cn/accounts/csrf';
const USER_INFO_URL = 'https://internal-api-lark-api.feishu.cn/accounts/web/user';
const MESSENGER_URL = 'https://open-dev.feishu.cn/messenger/';
const TICKET_URL = 'https://login.feishu.cn/suite/passport/frontier_ticket/';
const WS_BASE_URL = 'wss://msg-frontier.feishu.cn/ws/v2';

export interface AuthCredentials {
  wsUrl: string;
  userId: string;
  csrfToken: string;
  cookie: Record<string, string>;
}

/** Parse cookie string to a Record */
function parseCookie(cookieStr: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of cookieStr.split('; ')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx > 0) {
      cookies[part.slice(0, eqIdx)] = part.slice(eqIdx + 1);
    }
  }
  return cookies;
}

/** Format cookie dict back to string for HTTP headers */
function formatCookie(cookies: Record<string, string>): string {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}

/** MD5 hash (equivalent to lark_decrypt.js generate_access_key) */
function md5(str: string): string {
  return createHash('md5').update(str).digest('hex');
}

/** Generate random request ID (10 chars, alphanumeric) */
function generateRequestId(): string {
  return (Math.random().toString(36) + '0000000000').substring(2, 12);
}

/** Generate UUID v4 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Common browser headers */
function commonHeaders() {
  return {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'cache-control': 'no-cache',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'sec-ch-ua': '"Chromium";v="126", "Google Chrome";v="126", "Not=A?Brand";v="8"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'x-device-info': 'platform=websdk',
    'x-lgw-os-type': '1',
    'x-lgw-terminal-type': '2',
    'x-terminal-type': '2',
  };
}

/**
 * Full authentication flow:
 * 1. Parse cookie → extract device_id
 * 2. Get CSRF token
 * 3. Get user info (user ID)
 * 4. Get appKey from messenger page
 * 5. Generate access_key via MD5
 * 6. Get ticket
 * 7. Construct WS URL
 */
export async function authenticate(cookieStr: string): Promise<AuthCredentials> {
  const cookies = parseCookie(cookieStr);
  const cookieHeader = formatCookie(cookies);
  const deviceId = cookies['passport_web_did'];

  if (!deviceId) {
    throw new Error(
      'Cookie 缺少 "passport_web_did" 字段。\n' +
      '注意：passport_web_did 是 httpOnly cookie，document.cookie 无法获取！\n\n' +
      '正确获取方式：\n' +
      '1. 浏览器打开 https://www.feishu.cn 并登录\n' +
      '2. F12 → Network（网络）标签 → 刷新页面\n' +
      '3. 点击任意请求 → Headers → Request Headers → 复制 Cookie 字段的完整值\n' +
      '当前 Cookie 长度: ' + cookieStr.length + ' 字符\n' +
      '当前 Cookie 包含的字段: ' + Object.keys(parseCookie(cookieStr)).join(', ')
    );
  }

  logger.info('Starting authentication...');

  // Step 1: Get CSRF token
  logger.info('Getting CSRF token...');
  const csrfResp = await fetch(CSRF_TOKEN_URL + `?_t=${Date.now()}`, {
    method: 'POST',
    headers: {
      ...commonHeaders(),
      'content-type': 'application/json',
      'x-api-version': '1.0.8',
      'x-app-id': '12',
      'x-request-id': generateRequestId(),
      'origin': 'https://open-dev.feishu.cn',
      'cookie': cookieHeader,
    },
  });

  // Extract swp_csrf_token from Set-Cookie header
  const setCookies = csrfResp.headers.getSetCookie?.() || [];
  let csrfToken = '';
  for (const sc of setCookies) {
    const match = sc.match(/swp_csrf_token=([^;]+)/);
    if (match) {
      csrfToken = match[1];
      break;
    }
  }

  if (!csrfToken) {
    // Fallback: try from cookie
    csrfToken = cookies['swp_csrf_token'] || '';
    if (!csrfToken) {
      throw new Error('Failed to obtain CSRF token');
    }
    logger.warn('Using CSRF token from cookie (fallback)');
  }

  logger.info('CSRF token obtained');

  // Step 2: Get user info
  logger.info('Getting user info...');
  const userInfoResp = await fetch(USER_INFO_URL + `?app_id=12&_t=${Date.now()}`, {
    headers: {
      ...commonHeaders(),
      'content-type': 'application/json',
      'x-app-id': '12',
      'x-api-version': '1.0.8',
      'x-csrf-token': csrfToken,
      'x-locale': 'zh-CN',
      'x-request-id': generateUUID(),
      'origin': 'https://open-dev.feishu.cn',
      'referer': 'https://open-dev.feishu.cn/',
      'cookie': cookieHeader,
    },
  });
  const userInfoText = await userInfoResp.text();
  logger.info(`User info response status: ${userInfoResp.status}`);
  if (!userInfoText.startsWith('{')) {
    logger.error(`User info response is not JSON: ${userInfoText.substring(0, 200)}`);
    throw new Error(`User info API returned non-JSON response (status ${userInfoResp.status}): ${userInfoText.substring(0, 200)}`);
  }
  const userInfo = JSON.parse(userInfoText) as any;
  const userId = String(userInfo?.data?.user?.id || '');
  if (!userId) {
    throw new Error('Failed to get user ID. Cookie may be expired.');
  }
  logger.info(`User ID: ${userId}`);

  // Step 3: Get appKey from messenger page (follows redirects manually to pass cookies)
  logger.info('Getting appKey...');
  const navHeaders = {
    ...commonHeaders(),
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
    'cookie': cookieHeader,
  };
  let messengerUrl = MESSENGER_URL;
  let messengerText = '';
  for (let i = 0; i < 5; i++) {
    const resp = await fetch(messengerUrl, { headers: navHeaders, redirect: 'manual' });
    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get('location');
      if (location) {
        messengerUrl = location.startsWith('http') ? location : new URL(location, messengerUrl).toString();
        logger.info(`Messenger redirect ${i + 1}: ${messengerUrl}`);
        continue;
      }
    }
    messengerText = await resp.text();
    logger.info(`Messenger page status: ${resp.status}, length: ${messengerText.length}`);
    break;
  }
  const appKeyMatch = messengerText.match(/appKey:\s*["'](.+?)["']/);
  if (!appKeyMatch) {
    logger.error(`AppKey not found in messenger page. First 500 chars: ${messengerText.substring(0, 500)}`);
    throw new Error('Failed to extract appKey from messenger page');
  }
  const appKey = appKeyMatch[1];
  logger.info('AppKey obtained');

  // Step 4: Generate access_key (MD5 of magic string)
  const accessKey = md5(`2${appKey}${deviceId}f8a69f1719916z`);

  // Step 5: Get ticket
  logger.info('Getting frontier ticket...');
  const ticketResp = await fetch(TICKET_URL + `?local_device_id=${deviceId}`, {
    headers: { ...commonHeaders(), cookie: cookieHeader },
  });
  const ticketJson = await ticketResp.json() as any;
  const ticket = ticketJson?.ticket;
  if (!ticket) {
    throw new Error('Failed to get frontier ticket');
  }
  logger.info('Ticket obtained');

  // Step 6: Construct WebSocket URL
  const params = new URLSearchParams({
    access_key: accessKey,
    aid: '1',
    ticket,
    device_id: deviceId,
    fpid: '2',
    accept_encoding: 'gzip',
    request_id: generateRequestId(),
  });

  const wsUrl = `${WS_BASE_URL}?${params.toString()}`;
  logger.info('Authentication complete');

  return { wsUrl, userId, csrfToken, cookie: cookies };
}
