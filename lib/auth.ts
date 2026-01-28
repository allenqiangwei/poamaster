import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { prisma } from './prisma';

/**
 * 认证工具函数
 * 处理用户认证、密码哈希、Session 管理等
 */

const SALT_ROUNDS = 10;
const TOKEN_LENGTH = 32;
const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 天（毫秒）
const SESSION_EXTENSION_THRESHOLD = 7 * 24 * 60 * 60 * 1000; // 7 天（毫秒）

/**
 * 加密密码
 * @param password 明文密码
 * @returns 加密后的密码哈希
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * 验证密码
 * @param password 明文密码
 * @param hash 密码哈希
 * @returns 是否匹配
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * 生成随机 token
 * @returns 随机 token 字符串
 */
export function generateToken(): string {
  return randomBytes(TOKEN_LENGTH).toString('hex');
}

/**
 * 创建 Session
 * @param userId 用户 ID
 * @returns Session 对象（包含 token 和过期时间）
 */
export async function createSession(userId: string) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION);

  const session = await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
        },
      },
    },
  });

  return session;
}

/**
 * 验证 Session
 * @param token Session token
 * @returns Session 对象或 null（包含用户信息）
 */
export async function verifySession(token: string) {
  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        select: {
          id: true,
          username: true,
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  // 检查是否过期
  if (session.expiresAt < new Date()) {
    // Session 已过期，删除
    await prisma.session.delete({ where: { id: session.id } });
    return null;
  }

  // 滑动窗口：如果 Session 即将过期（剩余时间少于阈值），延长有效期
  const timeUntilExpiry = session.expiresAt.getTime() - Date.now();
  if (timeUntilExpiry < SESSION_EXTENSION_THRESHOLD) {
    const newExpiresAt = new Date(Date.now() + SESSION_DURATION);
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: newExpiresAt },
    });
    session.expiresAt = newExpiresAt;
  }

  return session;
}

/**
 * 删除 Session（登出）
 * @param token Session token
 */
export async function deleteSession(token: string): Promise<void> {
  await prisma.session.delete({
    where: { token },
  });
}

/**
 * 检查系统是否有用户
 * @returns 是否存在用户
 */
export async function hasUsers(): Promise<boolean> {
  const count = await prisma.user.count();
  return count > 0;
}

/**
 * 创建用户
 * @param username 用户名
 * @param password 明文密码
 * @returns 用户对象
 */
export async function createUser(username: string, password: string) {
  const hashedPassword = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      username,
      password: hashedPassword,
    },
    select: {
      id: true,
      username: true,
      createdAt: true,
    },
  });

  return user;
}

/**
 * 通过用户名查找用户
 * @param username 用户名
 * @returns 用户对象（包含密码哈希）或 null
 */
export async function findUserByUsername(username: string) {
  return prisma.user.findUnique({
    where: { username },
  });
}

/**
 * 清理过期的 Session
 * 定期调用此函数清理数据库中的过期 Session
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });

  return result.count;
}
