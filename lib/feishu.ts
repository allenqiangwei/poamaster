import { getConfig } from './config';

interface FeishuAccessTokenResponse {
  code: number;
  msg: string;
  tenant_access_token: string;
  expire: number;
}

export async function getFeishuAccessToken(): Promise<string> {
  const appId = await getConfig('feishu.appId');
  const appSecret = await getConfig('feishu.appSecret');

  if (!appId || !appSecret) {
    throw new Error('飞书配置不完整：缺少 App ID 或 App Secret');
  }

  const res = await fetch(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: appId,
        app_secret: appSecret
      })
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`获取飞书 Access Token 失败: HTTP ${res.status} - ${errorText.substring(0, 200)}`);
  }

  const contentType = res.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await res.text();
    throw new Error(`飞书 API 返回非 JSON 响应: ${text.substring(0, 200)}`);
  }

  const data: FeishuAccessTokenResponse = await res.json();

  if (data.code !== 0) {
    throw new Error(`获取飞书 Access Token 失败: ${data.msg} (code: ${data.code})`);
  }

  return data.tenant_access_token;
}

export async function sendFeishuMessage(
  chatId: string,
  content: any
): Promise<void> {
  const accessToken = await getFeishuAccessToken();

  const res = await fetch(
    'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: 'interactive',
        content: JSON.stringify(content)
      })
    }
  );

  const data = await res.json();

  if (data.code !== 0) {
    throw new Error(`发送飞书消息失败: ${data.msg}`);
  }
}

/**
 * 发送文本消息到飞书群聊
 */
export async function sendFeishuTextMessage(text: string): Promise<void> {
  const chatId = await getConfig('feishu.chatId');

  if (!chatId) {
    throw new Error('飞书群聊 ID 未配置，请在系统设置中配置');
  }

  const accessToken = await getFeishuAccessToken();

  const res = await fetch(
    'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({
          text: text
        })
      })
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`发送飞书消息失败: HTTP ${res.status} - ${errorText.substring(0, 200)}`);
  }

  const contentType = res.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    const text = await res.text();
    throw new Error(`飞书 API 返回非 JSON 响应: ${text.substring(0, 200)}`);
  }

  const data = await res.json();

  if (data.code !== 0) {
    throw new Error(`发送飞书消息失败: ${data.msg || JSON.stringify(data)} (code: ${data.code})`);
  }
}
