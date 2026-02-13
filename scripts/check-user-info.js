require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const cfg = await prisma.config.findFirst({ where: { key: 'feishu.cookie' } });
  if (!cfg) { console.log('No cookie'); process.exit(1); }
  const cookie = cfg.value;

  // Get CSRF token
  const csrfResp = await fetch('https://internal-api-lark-api.feishu.cn/accounts/csrf?_t=' + Date.now(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-app-id': '12', 'x-api-version': '1.0.8', 'cookie': cookie }
  });
  const setCookies = csrfResp.headers.getSetCookie() || [];
  let csrf = '';
  for (const sc of setCookies) {
    const m = sc.match(/swp_csrf_token=([^;]+)/);
    if (m) { csrf = m[1]; break; }
  }

  // Get full user info
  const resp = await fetch('https://internal-api-lark-api.feishu.cn/accounts/web/user?app_id=12&_t=' + Date.now(), {
    headers: {
      'content-type': 'application/json',
      'x-app-id': '12',
      'x-api-version': '1.0.8',
      'x-csrf-token': csrf,
      'x-device-info': 'platform=websdk',
      'x-lgw-os-type': '1',
      'x-lgw-terminal-type': '2',
      'x-terminal-type': '2',
      'user-agent': 'Mozilla/5.0',
      'cookie': cookie
    }
  });
  const text = await resp.text();
  console.log('Status:', resp.status);
  try {
    const data = JSON.parse(text);
    console.log(JSON.stringify(data.data?.user, null, 2));
  } catch {
    console.log('Raw:', text.substring(0, 500));
  }
  await prisma.$disconnect();
})();
