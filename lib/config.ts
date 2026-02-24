import { prisma } from './prisma';
import { encrypt, decrypt } from './crypto';

/**
 * 配置管理工具
 * 处理系统配置的读取和保存，自动加密/解密敏感配置
 */

// 敏感配置 key 列表（需要加密存储）
const SENSITIVE_KEYS = ['openai.apiKey', 'feishu.appSecret', 'feishu.cookie', 'serper.apiKey', 'x.password', 'x.email'];

/**
 * 检查是否为敏感配置
 */
function isSensitive(key: string): boolean {
  return SENSITIVE_KEYS.includes(key);
}

/**
 * 获取单个配置
 * @param key 配置键
 * @param defaultValue 默认值
 * @returns 配置值（自动解密敏感配置）
 */
export async function getConfig(
  key: string,
  defaultValue: string | null = null
): Promise<string | null> {
  const config = await prisma.config.findUnique({
    where: { key },
  });

  if (!config) {
    return defaultValue;
  }

  // 敏感配置需要解密
  if (isSensitive(key)) {
    try {
      return decrypt(config.value);
    } catch (error) {
      console.error(`Failed to decrypt config ${key}:`, error);
      return defaultValue;
    }
  }

  return config.value;
}

/**
 * 设置单个配置
 * @param key 配置键
 * @param value 配置值（敏感配置会自动加密）
 */
export async function setConfig(key: string, value: string): Promise<void> {
  const finalValue = isSensitive(key) ? encrypt(value) : value;

  await prisma.config.upsert({
    where: { key },
    create: { key, value: finalValue },
    update: { value: finalValue },
  });
}

/**
 * 获取所有配置
 * @returns 配置对象（敏感配置已解密）
 */
export async function getAllConfigs(): Promise<Record<string, string>> {
  const configs = await prisma.config.findMany();
  const result: Record<string, string> = {};

  for (const config of configs) {
    if (isSensitive(config.key)) {
      try {
        result[config.key] = decrypt(config.value);
      } catch (error) {
        console.error(`Failed to decrypt config ${config.key}:`, error);
      }
    } else {
      result[config.key] = config.value;
    }
  }

  return result;
}

/**
 * 删除配置
 * @param key 配置键
 */
export async function deleteConfig(key: string): Promise<void> {
  await prisma.config.delete({
    where: { key },
  });
}
