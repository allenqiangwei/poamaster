# POA Master 平台初始实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现 POA Master 多工具平台的基础架构和第一个工具（AI 驱动的 To-Do List）

**Architecture:** Next.js 14 全栈应用 + PostgreSQL + Prisma ORM + OpenAI GPT-4o + 飞书 API。采用 App Router 架构，前后端 API 在同一项目中，使用 Material UI 作为组件库。

**Tech Stack:** Next.js 14, TypeScript, Prisma, PostgreSQL, Material UI, OpenAI API, 飞书开放平台 API, node-cron

---

## 阶段一：项目初始化与基础配置

### Task 1: 初始化 Next.js 项目

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.js`
- Create: `.env.example`

**Step 1: 初始化 Next.js 项目**

```bash
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*"
```

选择配置：
- TypeScript: Yes
- ESLint: Yes
- Tailwind CSS: Yes (MUI 也会用到，两者可共存)
- App Router: Yes
- Import alias: @/*

**Step 2: 安装核心依赖**

```bash
npm install @prisma/client prisma
npm install @mui/material @mui/icons-material @emotion/react @emotion/styled
npm install openai
npm install bcryptjs
npm install node-cron
npm install date-fns
npm install -D @types/bcryptjs @types/node-cron
```

**Step 3: 创建环境变量模板**

创建 `.env.example`:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/poamaster"

# Session
SESSION_SECRET="change-this-to-random-32-char-string"

# OpenAI (可选，可在配置页设置)
OPENAI_API_KEY=""

# App
NODE_ENV="development"
PORT=3000
```

**Step 4: 复制环境变量文件**

```bash
cp .env.example .env
```

提示用户填写数据库连接信息。

**Step 5: 提交**

```bash
git add package.json package-lock.json tsconfig.json next.config.js .env.example .gitignore
git commit -m "feat: 初始化 Next.js 项目

- 配置 TypeScript 和 App Router
- 安装核心依赖（Prisma, MUI, OpenAI, bcrypt, cron）
- 创建环境变量模板

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 2: 配置 Prisma 和数据库 Schema

**Files:**
- Create: `prisma/schema.prisma`
- Create: `lib/prisma.ts`

**Step 1: 初始化 Prisma**

```bash
npx prisma init
```

**Step 2: 编写 Prisma Schema**

创建 `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// 用户
model User {
  id        String    @id @default(cuid())
  username  String    @unique
  password  String    // bcrypt 加密
  createdAt DateTime  @default(now())
  sessions  Session[]
}

// Session 认证
model Session {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([token])
}

// 负责人
model Assignee {
  id           String   @id @default(cuid())
  name         String   @unique
  feishuUserId String?  // 飞书 User ID
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  tasks        Task[]

  @@index([name])
}

// 任务
model Task {
  id         String     @id @default(cuid())
  title      String
  dod        String?    // Definition of Done
  dueDate    DateTime?
  status     TaskStatus @default(TODO)
  assigneeId String?
  assignee   Assignee?  @relation(fields: [assigneeId], references: [id])
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @updatedAt

  @@index([status])
  @@index([dueDate])
  @@index([assigneeId])
}

// 任务状态枚举
enum TaskStatus {
  TODO
  IN_PROGRESS
  DONE
  CANCELLED
  POSTPONED
}

// 配置存储
model Config {
  id        String   @id @default(cuid())
  key       String   @unique
  value     String
  updatedAt DateTime @updatedAt
}
```

**Step 3: 创建 Prisma Client 单例**

创建 `lib/prisma.ts`:

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

**Step 4: 运行数据库迁移**

```bash
npx prisma migrate dev --name init
```

预期输出: "Migration applied successfully"

**Step 5: 生成 Prisma Client**

```bash
npx prisma generate
```

**Step 6: 提交**

```bash
git add prisma/ lib/prisma.ts
git commit -m "feat: 配置 Prisma 和数据库 Schema

- 定义用户、Session、任务、负责人、配置模型
- 添加索引优化查询性能
- 创建 Prisma Client 单例

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 3: 创建认证工具函数

**Files:**
- Create: `lib/auth.ts`
- Create: `lib/config.ts`
- Create: `lib/crypto.ts`

**Step 1: 创建加密工具**

创建 `lib/crypto.ts`:

```typescript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters');
  }
  return crypto.scryptSync(secret, 'salt', KEY_LENGTH);
}

export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();

  // 返回格式: iv:tag:encrypted
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedData: string): string {
  const key = getEncryptionKey();
  const parts = encryptedData.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

**Step 2: 创建配置管理工具**

创建 `lib/config.ts`:

```typescript
import { prisma } from './prisma';
import { encrypt, decrypt } from './crypto';

const SENSITIVE_KEYS = ['openai.apiKey', 'feishu.appSecret'];

export async function getConfig(key: string): Promise<string | null> {
  const config = await prisma.config.findUnique({
    where: { key }
  });

  if (!config) return null;

  // 敏感信息需要解密
  if (SENSITIVE_KEYS.includes(key)) {
    try {
      return decrypt(config.value);
    } catch (error) {
      console.error(`Failed to decrypt config ${key}:`, error);
      return null;
    }
  }

  return config.value;
}

export async function setConfig(key: string, value: string): Promise<void> {
  const encryptedValue = SENSITIVE_KEYS.includes(key) ? encrypt(value) : value;

  await prisma.config.upsert({
    where: { key },
    update: { value: encryptedValue },
    create: { key, value: encryptedValue }
  });
}

export async function getAllConfigs(): Promise<Record<string, string>> {
  const configs = await prisma.config.findMany();
  const result: Record<string, string> = {};

  for (const config of configs) {
    if (SENSITIVE_KEYS.includes(config.key)) {
      try {
        result[config.key] = decrypt(config.value);
      } catch {
        result[config.key] = '[解密失败]';
      }
    } else {
      result[config.key] = config.value;
    }
  }

  return result;
}
```

**Step 3: 创建认证工具函数**

创建 `lib/auth.ts`:

```typescript
import { prisma } from './prisma';
import { hash, compare } from 'bcryptjs';
import crypto from 'crypto';

const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 天

export async function hashPassword(password: string): Promise<string> {
  return hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return compare(password, hashedPassword);
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function createSession(userId: string): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION);

  await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt
    }
  });

  return token;
}

export async function verifySession(token: string) {
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true }
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  // 滑动窗口：延长过期时间
  const newExpiresAt = new Date(Date.now() + SESSION_DURATION);
  await prisma.session.update({
    where: { id: session.id },
    data: { expiresAt: newExpiresAt }
  });

  return session;
}

export async function deleteSession(token: string): Promise<void> {
  await prisma.session.delete({
    where: { token }
  });
}

export async function hasUsers(): Promise<boolean> {
  const count = await prisma.user.count();
  return count > 0;
}

export async function createUser(username: string, password: string) {
  const hashedPassword = await hashPassword(password);

  return prisma.user.create({
    data: {
      username,
      password: hashedPassword
    }
  });
}
```

**Step 4: 提交**

```bash
git add lib/auth.ts lib/config.ts lib/crypto.ts
git commit -m "feat: 添加认证和配置管理工具函数

- 实现密码哈希和验证（bcrypt）
- 实现 Session 管理（生成、验证、删除）
- 实现配置加密存储（AES-256-GCM）
- 支持滑动窗口 Session 延期

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 阶段二：认证系统实现

### Task 4: 创建认证 API

**Files:**
- Create: `app/api/auth/init/route.ts`
- Create: `app/api/auth/login/route.ts`
- Create: `app/api/auth/logout/route.ts`
- Create: `app/api/auth/check/route.ts`

**Step 1: 创建初始化 API**

创建 `app/api/auth/init/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { hasUsers, createUser, createSession } from '@/lib/auth';

export async function GET() {
  const hasExistingUsers = await hasUsers();
  return NextResponse.json({ initialized: hasExistingUsers });
}

export async function POST(request: NextRequest) {
  // 检查是否已有用户
  const hasExistingUsers = await hasUsers();
  if (hasExistingUsers) {
    return NextResponse.json(
      { error: '系统已初始化' },
      { status: 400 }
    );
  }

  const { username, password } = await request.json();

  if (!username || !password) {
    return NextResponse.json(
      { error: '用户名和密码不能为空' },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: '密码至少 6 个字符' },
      { status: 400 }
    );
  }

  try {
    const user = await createUser(username, password);
    const token = await createSession(user.id);

    const response = NextResponse.json({ success: true });
    response.cookies.set('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 // 30 天
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: '创建用户失败' },
      { status: 500 }
    );
  }
}
```

**Step 2: 创建登录 API**

创建 `app/api/auth/login/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword, createSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  if (!username || !password) {
    return NextResponse.json(
      { error: '用户名和密码不能为空' },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { username }
  });

  if (!user) {
    return NextResponse.json(
      { error: '用户名或密码错误' },
      { status: 401 }
    );
  }

  const valid = await verifyPassword(password, user.password);
  if (!valid) {
    return NextResponse.json(
      { error: '用户名或密码错误' },
      { status: 401 }
    );
  }

  const token = await createSession(user.id);

  const response = NextResponse.json({ success: true });
  response.cookies.set('session_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60
  });

  return response;
}
```

**Step 3: 创建登出 API**

创建 `app/api/auth/logout/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { deleteSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('session_token')?.value;

  if (token) {
    await deleteSession(token);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.delete('session_token');

  return response;
}
```

**Step 4: 创建检查认证状态 API**

创建 `app/api/auth/check/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('session_token')?.value;

  if (!token) {
    return NextResponse.json({ authenticated: false });
  }

  const session = await verifySession(token);

  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: session.user.id,
      username: session.user.username
    }
  });
}
```

**Step 5: 提交**

```bash
git add app/api/auth/
git commit -m "feat: 实现认证 API

- 初始化 API：创建首个用户
- 登录 API：验证用户并创建 Session
- 登出 API：删除 Session
- 检查认证状态 API

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 5: 创建认证中间件

**Files:**
- Create: `middleware.ts`

**Step 1: 创建中间件**

创建 `middleware.ts`:

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 公开路径
  const publicPaths = ['/login', '/init', '/api/auth'];
  const isPublicPath = publicPaths.some(path => pathname.startsWith(path));

  if (isPublicPath) {
    return NextResponse.next();
  }

  // 检查 Session
  const token = request.cookies.get('session_token')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const session = await verifySession(token);

  if (!session) {
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('session_token');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)',
  ],
};
```

**Step 2: 提交**

```bash
git add middleware.ts
git commit -m "feat: 添加认证中间件

- 保护所有非公开路径
- 验证 Session token
- 未认证用户重定向到登录页

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 6: 创建认证页面

**Files:**
- Create: `app/(auth)/layout.tsx`
- Create: `app/(auth)/init/page.tsx`
- Create: `app/(auth)/login/page.tsx`
- Create: `app/layout.tsx`

**Step 1: 创建根布局**

创建 `app/layout.tsx`:

```typescript
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'POA Master',
  description: 'AI 驱动的多工具平台',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
```

**Step 2: 创建认证布局**

创建 `app/(auth)/layout.tsx`:

```typescript
import { Box, Container } from '@mui/material';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'grey.100'
      }}
    >
      <Container maxWidth="sm">
        {children}
      </Container>
    </Box>
  );
}
```

**Step 3: 创建初始化页面**

创建 `app/(auth)/init/page.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert
} from '@mui/material';

export default function InitPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // 检查是否已初始化
    fetch('/api/auth/init')
      .then(res => res.json())
      .then(data => {
        if (data.initialized) {
          router.push('/login');
        } else {
          setChecking(false);
        }
      });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    if (password.length < 6) {
      setError('密码至少 6 个字符');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (res.ok) {
        router.push('/');
      } else {
        setError(data.error || '初始化失败');
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <Paper sx={{ p: 4 }}>
        <Typography>检查系统状态...</Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 4 }}>
      <Typography variant="h4" gutterBottom align="center">
        欢迎使用 POA Master
      </Typography>
      <Typography variant="body2" color="text.secondary" align="center" mb={3}>
        首次使用，请设置管理员账号
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box component="form" onSubmit={handleSubmit}>
        <TextField
          label="用户名"
          fullWidth
          margin="normal"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <TextField
          label="密码"
          type="password"
          fullWidth
          margin="normal"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <TextField
          label="确认密码"
          type="password"
          fullWidth
          margin="normal"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
        <Button
          type="submit"
          variant="contained"
          fullWidth
          size="large"
          sx={{ mt: 3 }}
          disabled={loading}
        >
          {loading ? '创建中...' : '创建账号并登录'}
        </Button>
      </Box>
    </Paper>
  );
}
```

**Step 4: 创建登录页面**

创建 `app/(auth)/login/page.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert
} from '@mui/material';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // 检查是否已初始化
    fetch('/api/auth/init')
      .then(res => res.json())
      .then(data => {
        if (!data.initialized) {
          router.push('/init');
        } else {
          setChecking(false);
        }
      });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (res.ok) {
        router.push('/');
      } else {
        setError(data.error || '登录失败');
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <Paper sx={{ p: 4 }}>
        <Typography>加载中...</Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 4 }}>
      <Typography variant="h4" gutterBottom align="center">
        POA Master
      </Typography>
      <Typography variant="body2" color="text.secondary" align="center" mb={3}>
        登录以继续
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box component="form" onSubmit={handleSubmit}>
        <TextField
          label="用户名"
          fullWidth
          margin="normal"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <TextField
          label="密码"
          type="password"
          fullWidth
          margin="normal"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button
          type="submit"
          variant="contained"
          fullWidth
          size="large"
          sx={{ mt: 3 }}
          disabled={loading}
        >
          {loading ? '登录中...' : '登录'}
        </Button>
      </Box>
    </Paper>
  );
}
```

**Step 5: 提交**

```bash
git add app/
git commit -m "feat: 实现认证页面

- 初始化页面：创建首个用户
- 登录页面：用户登录
- 自动检测系统状态并重定向
- 使用 Material UI 组件

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 阶段三：To-Do List 核心功能

### Task 7: 创建任务 CRUD API

**Files:**
- Create: `app/api/tasks/route.ts`
- Create: `app/api/tasks/[id]/route.ts`
- Create: `app/api/assignees/route.ts`
- Create: `app/api/assignees/[id]/route.ts`

**Step 1: 创建任务列表和创建 API**

创建 `app/api/tasks/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TaskStatus } from '@prisma/client';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const status = searchParams.get('status') as TaskStatus | null;
  const assigneeId = searchParams.get('assigneeId');
  const dueDateStart = searchParams.get('dueDateStart');
  const dueDateEnd = searchParams.get('dueDateEnd');

  const where: any = {};

  if (status) {
    where.status = status;
  }

  if (assigneeId) {
    where.assigneeId = assigneeId;
  }

  if (dueDateStart || dueDateEnd) {
    where.dueDate = {};
    if (dueDateStart) {
      where.dueDate.gte = new Date(dueDateStart);
    }
    if (dueDateEnd) {
      where.dueDate.lte = new Date(dueDateEnd);
    }
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      assignee: true
    },
    orderBy: [
      { dueDate: 'asc' },
      { createdAt: 'desc' }
    ]
  });

  return NextResponse.json(tasks);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const { title, dod, dueDate, status, assigneeId } = body;

  if (!title) {
    return NextResponse.json(
      { error: '任务标题不能为空' },
      { status: 400 }
    );
  }

  const task = await prisma.task.create({
    data: {
      title,
      dod: dod || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      status: status || 'TODO',
      assigneeId: assigneeId || null
    },
    include: {
      assignee: true
    }
  });

  return NextResponse.json(task);
}
```

**Step 2: 创建单个任务操作 API**

创建 `app/api/tasks/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const task = await prisma.task.findUnique({
    where: { id: params.id },
    include: { assignee: true }
  });

  if (!task) {
    return NextResponse.json(
      { error: '任务不存在' },
      { status: 404 }
    );
  }

  return NextResponse.json(task);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json();

  const task = await prisma.task.update({
    where: { id: params.id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.dod !== undefined && { dod: body.dod }),
      ...(body.dueDate !== undefined && {
        dueDate: body.dueDate ? new Date(body.dueDate) : null
      }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.assigneeId !== undefined && { assigneeId: body.assigneeId })
    },
    include: { assignee: true }
  });

  return NextResponse.json(task);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  await prisma.task.delete({
    where: { id: params.id }
  });

  return NextResponse.json({ success: true });
}
```

**Step 3: 创建负责人 API**

创建 `app/api/assignees/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const assignees = await prisma.assignee.findMany({
    include: {
      _count: {
        select: { tasks: true }
      }
    },
    orderBy: { name: 'asc' }
  });

  return NextResponse.json(assignees);
}

export async function POST(request: NextRequest) {
  const { name, feishuUserId } = await request.json();

  if (!name) {
    return NextResponse.json(
      { error: '负责人姓名不能为空' },
      { status: 400 }
    );
  }

  try {
    const assignee = await prisma.assignee.create({
      data: {
        name,
        feishuUserId: feishuUserId || null
      }
    });

    return NextResponse.json(assignee);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: '该负责人已存在' },
        { status: 400 }
      );
    }
    throw error;
  }
}
```

**Step 4: 创建单个负责人操作 API**

创建 `app/api/assignees/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { name, feishuUserId } = await request.json();

  const assignee = await prisma.assignee.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(feishuUserId !== undefined && { feishuUserId })
    }
  });

  return NextResponse.json(assignee);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // 先将关联任务的负责人设为 null
  await prisma.task.updateMany({
    where: { assigneeId: params.id },
    data: { assigneeId: null }
  });

  await prisma.assignee.delete({
    where: { id: params.id }
  });

  return NextResponse.json({ success: true });
}
```

**Step 5: 提交**

```bash
git add app/api/tasks/ app/api/assignees/
git commit -m "feat: 实现任务和负责人 CRUD API

- 任务列表、创建、更新、删除
- 支持按状态、负责人、截止时间筛选
- 负责人列表、创建、更新、删除
- 删除负责人时自动解除任务关联

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 8: 实现 AI 任务提取 API

**Files:**
- Create: `lib/openai.ts`
- Create: `app/api/tasks/extract/route.ts`

**Step 1: 创建 OpenAI 工具函数**

创建 `lib/openai.ts`:

```typescript
import OpenAI from 'openai';
import { getConfig } from './config';

let openaiClient: OpenAI | null = null;

export async function getOpenAIClient(): Promise<OpenAI> {
  if (openaiClient) {
    return openaiClient;
  }

  const apiKey = await getConfig('openai.apiKey') || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OpenAI API Key 未配置');
  }

  openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

export interface ExtractedTask {
  title: string;
  assignee: string | null;
  dueDate: string | null; // ISO 8601
  dod: string | null;
}

const SYSTEM_PROMPT = `# Role: 任务提取与结构化助手

## Profile
- language: 中文
- description: 从用户提供的非结构化文本中，精准提取其中包含的所有任务信息，并将其转换为结构化的任务数据，便于后续管理、跟踪与分析。
- background: 具备自然语言理解与信息抽取能力，熟悉常见任务表达方式（包括显性与隐性任务）、时间表达（绝对时间与相对时间）、角色分工和完成标准等语义模式。
- personality: 客观严谨、逻辑清晰、表达简洁、一致性强，不臆测、不夸大，专注于从文本中提取可被证据支持的信息。
- expertise: 任务识别与抽取、时间解析与标准化（ISO 8601）、责任人识别、完成标准（DoD）提炼、中文自然语言语义分析。
- target_audience: 需要从对话、会议记录、邮件、备忘录、需求文档等文本中提取任务信息的个人用户、项目经理、团队协作工具和自动化系统。

## Skills

1. 任务抽取与结构化
   - 任务识别: 从长文本中识别所有显性或隐性包含"待完成行动"的语句或片段，并拆分为独立任务。
   - 字段结构化: 将每个任务统一整理为结构化字段：title、assignee、dueDate、dod。
   - 多任务分离: 在同一句或同一段中，区分并拆分多个不同的任务，避免合并为一个任务。
   - 语义归纳: 将冗长或口语化的任务描述归纳为简洁、清晰且不失原意的任务标题。

2. 时间与责任人解析
   - 时间解析: 识别绝对时间与相对时间表达（如"下周三""本月底""三天内"），并转换为ISO 8601日期（YYYY-MM-DD）。
   - 相对时间推算: 基于给定的"当前日期"语境，将相对时间计算为具体日期；如未给定当前日期，按系统当前日期推算。
   - 责任人识别: 从文本中识别任务执行者（如人名、昵称、角色称呼），并映射为assignee字段；未明确指派时返回null。
   - 完成标准提炼: 从说明、要求或验收条件中提炼可验证的完成标准作为dod字段；若无明确标准则返回null。

## Rules

1. 基本原则：
   - 忠实文本: 仅基于用户提供内容提取任务，不添加文本中不存在的任务或信息，不进行主观推断。
   - 结构统一: 所有输出任务必须包含相同字段结构：title、assignee、dueDate、dod，字段名保持英文小写。
   - 明确不假设: 当负责人或完成标准未在文本中明确出现时，必须返回null，而不是猜测或填入默认值。
   - 时间标准化: 所有截止时间统一转换并输出为ISO 8601日期格式（YYYY-MM-DD）；无法确定具体日期时，dueDate返回null。

2. 行为准则：
   - 全量提取: 尽可能识别并提取文本中出现的所有任务，而非只提取其中一部分。
   - 精准拆分: 对含有多个动作的句子，若可分解为可独立执行的任务，应拆分为多个任务条目。
   - 语义简化: title应简洁明了，保留任务核心动作与对象，避免冗余背景描述。
   - 中立表达: 不对任务内容进行评价或修改，只做客观抽取与整理，不加入建议、解释或评论。

3. 限制条件：
   - 不输出多余内容: 输出中不得包含解释性文字、分析过程或额外说明，只返回任务数据结构本身。
   - 不改变语义: 在概括title和dod时，不得改变原有任务意图或要求，只能进行压缩与重述。
   - 不虚构日期: 若相对时间表达缺乏足够信息无法推算到具体日期（如缺少参考当前日期），则dueDate必须为null。
   - 不生成示例: 用户未明确要求时，不主动生成示例任务或演示内容。

## Workflows

- 目标: 从给定的用户文本中，提取所有任务，并以统一结构返回每个任务的title、assignee、dueDate（ISO 8601）、dod。

- 步骤 1: 识别任务
  - 通读用户提供的"内容"文本，识别所有包含"需要做、要去做、待完成、需要处理"等含义的语句或片段。
  - 对于一条语句中包含多个动作且可以独立完成的，拆分为多个任务。
  - 形成任务候选列表，每个候选对应一条潜在任务。

- 步骤 2: 提取字段
  - 对每个任务候选：
    - 提炼title：用简洁短句概括任务核心动作和对象。
    - 提取assignee：查找是否有明确的负责人姓名、昵称或角色称呼（如"小王""产品经理""你来负责"），若无则设为null。
    - 提取dueDate：识别绝对时间（如"2025年3月1日"）和相对时间（如"下周三""本月底""三天内"），在有参考当前日期的前提下换算为具体日期并转为YYYY-MM-DD；无法确定则设为null。
    - 提取dod：从描述中抽取可作为"完成标准"的内容（如"通过测试""文档补充完整并评审通过"），若未提及则设为null。

- 步骤 3: 结构化输出
  - 将所有任务以列表形式输出，每个元素为一个对象，包含：
    - title: string
    - assignee: string 或 null
    - dueDate: string（ISO 8601，YYYY-MM-DD）或 null
    - dod: string 或 null
  - 确保字段顺序与名称统一，避免加入任何额外字段或说明文本。

- 预期结果: 返回一个仅包含任务数据的结构化列表，覆盖文本中所有可识别任务，每个任务包含规范化的title、准确或为空的assignee、ISO 8601格式或为空的dueDate，以及对应的dod或null，便于后续系统直接使用。

## Initialization
作为任务提取与结构化助手，你必须遵守上述Rules，按照Workflows执行任务。`;

export async function extractTasksFromText(
  text: string
): Promise<ExtractedTask[]> {
  const client = await getOpenAIClient();

  const currentDate = new Date().toISOString().split('T')[0];

  const completion = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `当前日期：${currentDate}\n\n从以下内容中提取所有任务：\n\n${text}`
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7
  });

  const content = completion.choices[0].message.content;
  if (!content) {
    throw new Error('AI 未返回有效内容');
  }

  const result = JSON.parse(content);

  // 确保返回的是数组
  if (Array.isArray(result)) {
    return result;
  } else if (result.tasks && Array.isArray(result.tasks)) {
    return result.tasks;
  } else {
    throw new Error('AI 返回格式错误');
  }
}
```

**Step 2: 创建提取 API**

创建 `app/api/tasks/extract/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { extractTasksFromText } from '@/lib/openai';

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: '请提供要提取的文本内容' },
        { status: 400 }
      );
    }

    const tasks = await extractTasksFromText(text);

    return NextResponse.json({ tasks });
  } catch (error: any) {
    console.error('提取任务失败:', error);

    if (error.message.includes('API Key')) {
      return NextResponse.json(
        { error: 'OpenAI API Key 未配置，请在设置页面配置' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: '提取任务失败，请检查输入内容或稍后重试' },
      { status: 500 }
    );
  }
}
```

**Step 3: 提交**

```bash
git add lib/openai.ts app/api/tasks/extract/
git commit -m "feat: 实现 AI 任务提取功能

- 集成 OpenAI GPT-4o
- 使用专业的任务提取提示词
- 支持相对时间转换为绝对日期
- 返回结构化任务数据

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

---

## 阶段四：任务列表前端界面

### Task 9: 创建主应用布局和首页

**Files:**
- Create: `app/(dashboard)/layout.tsx`
- Create: `app/(dashboard)/page.tsx`
- Create: `components/Header.tsx`

**Step 1: 创建主应用布局**

创建 `app/(dashboard)/layout.tsx`:

```typescript
import { Box } from '@mui/material';
import Header from '@/components/Header';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'grey.50' }}>
      <Header />
      <Box component="main">
        {children}
      </Box>
    </Box>
  );
}
```

**Step 2: 创建顶部导航栏**

创建 `components/Header.tsx`:

```typescript
'use client';

import { useRouter } from 'next/navigation';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Logout as LogoutIcon
} from '@mui/icons-material';

export default function Header() {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <AppBar position="static">
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          📋 POA Master
        </Typography>
        <Box>
          <Button
            color="inherit"
            startIcon={<SettingsIcon />}
            onClick={() => router.push('/settings')}
          >
            设置
          </Button>
          <Button
            color="inherit"
            startIcon={<LogoutIcon />}
            onClick={handleLogout}
          >
            登出
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
```

**Step 3: 创建首页（工具集合）**

创建 `app/(dashboard)/page.tsx`:

```typescript
'use client';

import { useRouter } from 'next/navigation';
import {
  Container,
  Grid,
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Box
} from '@mui/material';
import { CheckBox as TodoIcon } from '@mui/icons-material';

export default function HomePage() {
  const router = useRouter();

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        工具集合
      </Typography>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <TodoIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
                <Typography variant="h5">
                  To-Do List
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">
                AI 驱动的任务管理工具，支持从文本、文件、图片中提取任务
              </Typography>
            </CardContent>
            <CardActions>
              <Button
                size="small"
                variant="contained"
                fullWidth
                onClick={() => router.push('/todo')}
              >
                进入工具
              </Button>
            </CardActions>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <Card sx={{ bgcolor: 'grey.100' }}>
            <CardContent>
              <Typography variant="h5" gutterBottom>
                工具 2
              </Typography>
              <Typography variant="body2" color="text.secondary">
                即将推出...
              </Typography>
            </CardContent>
            <CardActions>
              <Button size="small" disabled fullWidth>
                敬请期待
              </Button>
            </CardActions>
          </Card>
        </Grid>
      </Grid>
    </Container>
  );
}
```

**Step 4: 提交**

```bash
git add app/(dashboard)/ components/Header.tsx
git commit -m "feat: 创建主应用布局和首页

- 顶部导航栏（设置、登出）
- 工具集合首页
- To-Do List 工具卡片

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 10: 创建任务列表页面

**Files:**
- Create: `app/(dashboard)/todo/page.tsx`
- Create: `components/TaskTable.tsx`
- Create: `components/TaskStatusChip.tsx`

**Step 1: 创建任务状态芯片组件**

创建 `components/TaskStatusChip.tsx`:

```typescript
import { Chip } from '@mui/material';
import { TaskStatus } from '@prisma/client';

const STATUS_CONFIG = {
  TODO: { label: '待办', color: 'default' as const },
  IN_PROGRESS: { label: '进行中', color: 'primary' as const },
  DONE: { label: '已完成', color: 'success' as const },
  CANCELLED: { label: '已取消', color: 'error' as const },
  POSTPONED: { label: '已推迟', color: 'warning' as const }
};

interface TaskStatusChipProps {
  status: TaskStatus;
}

export default function TaskStatusChip({ status }: TaskStatusChipProps) {
  const config = STATUS_CONFIG[status];
  return <Chip label={config.label} color={config.color} size="small" />;
}
```

**Step 2: 创建任务表格组件**

创建 `components/TaskTable.tsx`:

```typescript
'use client';

import { format, isToday, isWithinInterval, addDays } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Box,
  Typography,
  Select,
  MenuItem
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  CheckCircle as DoneIcon
} from '@mui/icons-material';
import { TaskStatus } from '@prisma/client';
import TaskStatusChip from './TaskStatusChip';

interface Task {
  id: string;
  title: string;
  dueDate: string | null;
  status: TaskStatus;
  assignee: { id: string; name: string } | null;
}

interface TaskTableProps {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onMarkDone: (id: string) => void;
}

export default function TaskTable({
  tasks,
  onEdit,
  onDelete,
  onStatusChange,
  onMarkDone
}: TaskTableProps) {
  const getRowColor = (dueDate: string | null) => {
    if (!dueDate) return 'transparent';

    const date = new Date(dueDate);
    const today = new Date();
    const sevenDaysLater = addDays(today, 7);

    if (isToday(date)) {
      return '#ffebee'; // 红色背景
    }

    if (isWithinInterval(date, { start: today, end: sevenDaysLater })) {
      return '#fff9c4'; // 黄色背景
    }

    return 'transparent';
  };

  if (tasks.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6" color="text.secondary">
          📋
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
          暂无任务
        </Typography>
        <Typography variant="body2" color="text.secondary">
          点击"添加任务"开始使用
        </Typography>
      </Box>
    );
  }

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>任务标题</TableCell>
            <TableCell>负责人</TableCell>
            <TableCell>截止时间</TableCell>
            <TableCell>状态</TableCell>
            <TableCell align="right">操作</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {tasks.map((task) => (
            <TableRow
              key={task.id}
              sx={{ bgcolor: getRowColor(task.dueDate) }}
            >
              <TableCell>{task.title}</TableCell>
              <TableCell>{task.assignee?.name || '-'}</TableCell>
              <TableCell>
                {task.dueDate
                  ? format(new Date(task.dueDate), 'yyyy-MM-dd HH:mm')
                  : '-'}
              </TableCell>
              <TableCell>
                <Select
                  value={task.status}
                  onChange={(e) =>
                    onStatusChange(task.id, e.target.value as TaskStatus)
                  }
                  size="small"
                  variant="standard"
                >
                  <MenuItem value="TODO">待办</MenuItem>
                  <MenuItem value="IN_PROGRESS">进行中</MenuItem>
                  <MenuItem value="DONE">已完成</MenuItem>
                  <MenuItem value="CANCELLED">已取消</MenuItem>
                  <MenuItem value="POSTPONED">已推迟</MenuItem>
                </Select>
              </TableCell>
              <TableCell align="right">
                <IconButton
                  size="small"
                  onClick={() => onMarkDone(task.id)}
                  title="标记完成"
                >
                  <DoneIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => onEdit(task)}
                  title="编辑"
                >
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => onDelete(task.id)}
                  title="删除"
                  color="error"
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
```

**Step 3: 创建任务列表页面**

创建 `app/(dashboard)/todo/page.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container,
  Box,
  Tabs,
  Tab,
  Button,
  Typography
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { TaskStatus } from '@prisma/client';
import TaskTable from '@/components/TaskTable';

interface Task {
  id: string;
  title: string;
  dueDate: string | null;
  status: TaskStatus;
  assignee: { id: string; name: string } | null;
}

export default function TodoPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState<TaskStatus | 'ALL'>('ALL');

  useEffect(() => {
    loadTasks();
  }, [currentTab]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (currentTab !== 'ALL') {
        params.set('status', currentTab);
      }

      const res = await fetch(`/api/tasks?${params}`);
      const data = await res.json();
      setTasks(data);
    } catch (error) {
      console.error('加载任务失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id: string, status: TaskStatus) => {
    try {
      await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      loadTasks();
    } catch (error) {
      console.error('更新状态失败:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个任务吗？')) return;

    try {
      await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
      loadTasks();
    } catch (error) {
      console.error('删除任务失败:', error);
    }
  };

  const handleMarkDone = async (id: string) => {
    await handleStatusChange(id, 'DONE');
  };

  const getTaskCountByStatus = (status: TaskStatus | 'ALL') => {
    if (status === 'ALL') return tasks.length;
    return tasks.filter((t) => t.status === status).length;
  };

  const filteredTasks =
    currentTab === 'ALL'
      ? tasks
      : tasks.filter((t) => t.status === currentTab);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3
        }}
      >
        <Typography variant="h4">📋 To-Do List</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => router.push('/todo/new')}
        >
          添加任务
        </Button>
      </Box>

      <Tabs
        value={currentTab}
        onChange={(_, value) => setCurrentTab(value)}
        sx={{ mb: 3 }}
      >
        <Tab label={`全部 (${getTaskCountByStatus('ALL')})`} value="ALL" />
        <Tab label={`待办 (${getTaskCountByStatus('TODO')})`} value="TODO" />
        <Tab
          label={`进行中 (${getTaskCountByStatus('IN_PROGRESS')})`}
          value="IN_PROGRESS"
        />
        <Tab label={`已完成 (${getTaskCountByStatus('DONE')})`} value="DONE" />
        <Tab
          label={`已取消 (${getTaskCountByStatus('CANCELLED')})`}
          value="CANCELLED"
        />
        <Tab
          label={`已推迟 (${getTaskCountByStatus('POSTPONED')})`}
          value="POSTPONED"
        />
      </Tabs>

      {loading ? (
        <Typography>加载中...</Typography>
      ) : (
        <TaskTable
          tasks={filteredTasks}
          onEdit={(task) => router.push(`/todo/${task.id}`)}
          onDelete={handleDelete}
          onStatusChange={handleStatusChange}
          onMarkDone={handleMarkDone}
        />
      )}
    </Container>
  );
}
```

**Step 4: 提交**

```bash
git add app/(dashboard)/todo/page.tsx components/TaskTable.tsx components/TaskStatusChip.tsx
git commit -m "feat: 实现任务列表页面

- 按状态分页签显示任务
- 任务表格（颜色标识今日/本周截止）
- 支持快速改变状态、删除、标记完成
- 空状态提示

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 11: 创建 AI 任务提取页面

**Files:**
- Create: `app/(dashboard)/todo/new/page.tsx`
- Create: `components/TaskExtractForm.tsx`
- Create: `components/TaskPreviewTable.tsx`

**Step 1: 创建任务预览表格**

创建 `components/TaskPreviewTable.tsx`:

```typescript
'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  IconButton,
  Checkbox
} from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';
import { ExtractedTask } from '@/lib/openai';

interface TaskPreviewTableProps {
  tasks: ExtractedTask[];
  onChange: (tasks: ExtractedTask[]) => void;
}

export default function TaskPreviewTable({
  tasks,
  onChange
}: TaskPreviewTableProps) {
  const handleFieldChange = (
    index: number,
    field: keyof ExtractedTask,
    value: string | null
  ) => {
    const newTasks = [...tasks];
    newTasks[index] = { ...newTasks[index], [field]: value };
    onChange(newTasks);
  };

  const handleDelete = (index: number) => {
    const newTasks = tasks.filter((_, i) => i !== index);
    onChange(newTasks);
  };

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>任务标题</TableCell>
            <TableCell>负责人</TableCell>
            <TableCell>截止时间</TableCell>
            <TableCell>DoD</TableCell>
            <TableCell>操作</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {tasks.map((task, index) => (
            <TableRow key={index}>
              <TableCell>
                <TextField
                  value={task.title}
                  onChange={(e) =>
                    handleFieldChange(index, 'title', e.target.value)
                  }
                  size="small"
                  fullWidth
                />
              </TableCell>
              <TableCell>
                <TextField
                  value={task.assignee || ''}
                  onChange={(e) =>
                    handleFieldChange(
                      index,
                      'assignee',
                      e.target.value || null
                    )
                  }
                  size="small"
                  fullWidth
                />
              </TableCell>
              <TableCell>
                <TextField
                  type="datetime-local"
                  value={task.dueDate || ''}
                  onChange={(e) =>
                    handleFieldChange(
                      index,
                      'dueDate',
                      e.target.value || null
                    )
                  }
                  size="small"
                  fullWidth
                />
              </TableCell>
              <TableCell>
                <TextField
                  value={task.dod || ''}
                  onChange={(e) =>
                    handleFieldChange(index, 'dod', e.target.value || null)
                  }
                  size="small"
                  fullWidth
                  multiline
                />
              </TableCell>
              <TableCell>
                <IconButton
                  size="small"
                  onClick={() => handleDelete(index)}
                  color="error"
                >
                  <DeleteIcon />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
```

**Step 2: 创建 AI 提取页面**

创建 `app/(dashboard)/todo/new/page.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  CircularProgress
} from '@mui/material';
import { ExtractedTask } from '@/lib/openai';
import TaskPreviewTable from '@/components/TaskPreviewTable';

export default function NewTaskPage() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [extractedTasks, setExtractedTasks] = useState<ExtractedTask[]>([]);

  const handleExtract = async () => {
    if (!text.trim()) {
      setError('请输入要提取的文本内容');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/tasks/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      const data = await res.json();

      if (res.ok) {
        if (data.tasks.length === 0) {
          setError('未识别到任务，请检查输入内容');
        } else {
          setExtractedTasks(data.tasks);
        }
      } else {
        setError(data.error || '提取失败');
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');

    try {
      // 批量创建任务
      for (const task of extractedTasks) {
        await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: task.title,
            dod: task.dod,
            dueDate: task.dueDate,
            status: 'TODO'
          })
        });
      }

      router.push('/todo');
    } catch {
      setError('保存任务失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        ✨ AI 提取任务
      </Typography>

      {extractedTasks.length === 0 ? (
        <Paper sx={{ p: 3, mt: 3 }}>
          <Typography variant="h6" gutterBottom>
            粘贴文本内容
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            支持从会议记录、邮件、备忘录等文本中提取任务
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <TextField
            multiline
            rows={10}
            fullWidth
            placeholder="例如：
明天下午3点前，张三需要完成用户认证模块的开发，要求代码通过测试并部署。
李四负责提交项目周报，截止今天下午5点。
王五本周内完成数据库设计文档。"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              onClick={handleExtract}
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : '提取任务'}
            </Button>
            <Button variant="outlined" onClick={() => router.back()}>
              取消
            </Button>
          </Box>
        </Paper>
      ) : (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" gutterBottom>
            提取结果（共 {extractedTasks.length} 个任务）
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            请检查并修改提取的任务信息
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <TaskPreviewTable
            tasks={extractedTasks}
            onChange={setExtractedTasks}
          />

          <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : '保存所有任务'}
            </Button>
            <Button
              variant="outlined"
              onClick={() => setExtractedTasks([])}
            >
              重新提取
            </Button>
          </Box>
        </Box>
      )}
    </Container>
  );
}
```

**Step 3: 提交**

```bash
git add app/(dashboard)/todo/new/ components/TaskPreviewTable.tsx
git commit -m "feat: 实现 AI 任务提取页面

- 文本输入和 AI 提取
- 任务预览表格（支持内联编辑）
- 批量保存任务
- 错误处理和加载状态

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 阶段五：配置页面和飞书集成

### Task 12: 创建配置页面

**Files:**
- Create: `app/(dashboard)/settings/page.tsx`
- Create: `app/api/config/route.ts`

**Step 1: 创建配置 API**

创建 `app/api/config/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getAllConfigs, setConfig, getConfig } from '@/lib/config';

export async function GET() {
  try {
    const configs = await getAllConfigs();
    return NextResponse.json(configs);
  } catch (error) {
    return NextResponse.json(
      { error: '获取配置失败' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string') {
        await setConfig(key, value);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: '保存配置失败' },
      { status: 500 }
    );
  }
}
```

**Step 2: 创建配置页面**

创建 `app/(dashboard)/settings/page.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Divider,
  Alert,
  Grid
} from '@mui/material';

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [configs, setConfigs] = useState({
    'openai.apiKey': '',
    'feishu.appId': '',
    'feishu.appSecret': '',
    'feishu.chatId': '',
    'feishu.enabled': 'true'
  });

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      setConfigs({ ...configs, ...data });
    } catch {
      setError('加载配置失败');
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setSuccess(false);
    setError('');

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configs)
      });

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError('保存失败');
      }
    } catch {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        ⚙️ 系统配置
      </Typography>

      {success && (
        <Alert severity="success" sx={{ mt: 2 }}>
          配置保存成功
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          OpenAI 配置
        </Typography>
        <TextField
          label="API Key"
          fullWidth
          margin="normal"
          type="password"
          value={configs['openai.apiKey']}
          onChange={(e) =>
            setConfigs({ ...configs, 'openai.apiKey': e.target.value })
          }
          helperText="用于 AI 任务提取功能"
        />
      </Paper>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          飞书配置
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField
              label="App ID"
              fullWidth
              value={configs['feishu.appId']}
              onChange={(e) =>
                setConfigs({ ...configs, 'feishu.appId': e.target.value })
              }
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              label="App Secret"
              fullWidth
              type="password"
              value={configs['feishu.appSecret']}
              onChange={(e) =>
                setConfigs({ ...configs, 'feishu.appSecret': e.target.value })
              }
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              label="通知群聊 Chat ID"
              fullWidth
              value={configs['feishu.chatId']}
              onChange={(e) =>
                setConfigs({ ...configs, 'feishu.chatId': e.target.value })
              }
              helperText="接收每日任务通知的群聊 ID"
            />
          </Grid>
        </Grid>
      </Paper>

      <Box sx={{ mt: 3 }}>
        <Button
          variant="contained"
          size="large"
          onClick={handleSave}
          disabled={loading}
        >
          {loading ? '保存中...' : '保存配置'}
        </Button>
      </Box>
    </Container>
  );
}
```

**Step 3: 提交**

```bash
git add app/(dashboard)/settings/ app/api/config/
git commit -m "feat: 实现配置页面

- OpenAI API Key 配置
- 飞书应用配置
- 配置加密存储
- 保存成功提示

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

### Task 13: 实现飞书通知系统

**Files:**
- Create: `lib/feishu.ts`
- Create: `services/scheduler.ts`

**Step 1: 创建飞书工具函数**

创建 `lib/feishu.ts`:

```typescript
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
    throw new Error('飞书配置不完整');
  }

  const res = await fetch(
    'https://open.feishu.cn/open-api/auth/v3/tenant_access_token/internal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: appId,
        app_secret: appSecret
      })
    }
  );

  const data: FeishuAccessTokenResponse = await res.json();

  if (data.code !== 0) {
    throw new Error(`获取飞书 Access Token 失败: ${data.msg}`);
  }

  return data.tenant_access_token;
}

export async function sendFeishuMessage(
  chatId: string,
  content: any
): Promise<void> {
  const accessToken = await getFeishuAccessToken();

  const res = await fetch(
    'https://open.feishu.cn/open-api/im/v1/messages?receive_id_type=chat_id',
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
```

**Step 2: 创建定时任务服务**

创建 `services/scheduler.ts`:

```typescript
import cron from 'node-cron';
import { prisma } from '@/lib/prisma';
import { getConfig } from '@/lib/config';
import { sendFeishuMessage } from '@/lib/feishu';
import { format, startOfDay, endOfDay, addDays } from 'date-fns';

export async function sendDailyTaskNotification() {
  console.log('[Scheduler] 开始发送每日任务通知...');

  try {
    const chatId = await getConfig('feishu.chatId');
    const enabled = await getConfig('feishu.enabled');

    if (!chatId || enabled !== 'true') {
      console.log('[Scheduler] 飞书通知未启用或未配置');
      return;
    }

    const today = startOfDay(new Date());
    const tomorrow = endOfDay(today);
    const nextWeek = addDays(today, 7);

    // 今日任务
    const todayTasks = await prisma.task.findMany({
      where: {
        dueDate: {
          gte: today,
          lte: tomorrow
        },
        status: {
          notIn: ['DONE', 'CANCELLED']
        }
      },
      include: { assignee: true },
      orderBy: { dueDate: 'asc' }
    });

    // 本周任务
    const weekTasks = await prisma.task.findMany({
      where: {
        dueDate: {
          gt: tomorrow,
          lte: nextWeek
        },
        status: {
          notIn: ['DONE', 'CANCELLED']
        }
      },
      include: { assignee: true },
      orderBy: { dueDate: 'asc' }
    });

    // 构建消息卡片
    const elements: any[] = [
      {
        tag: 'div',
        text: {
          content: `**🔴 今日待办任务 (${todayTasks.length} 个)**`,
          tag: 'lark_md'
        }
      },
      { tag: 'hr' }
    ];

    todayTasks.forEach((task) => {
      const timeStr = task.dueDate
        ? format(new Date(task.dueDate), 'HH:mm')
        : '';
      elements.push({
        tag: 'div',
        text: {
          content: `• ${task.title}\n  负责人：${task.assignee?.name || '未分配'}\n  截止：今天 ${timeStr}${task.dod ? `\n  DoD：${task.dod}` : ''}`,
          tag: 'lark_md'
        }
      });
    });

    if (weekTasks.length > 0) {
      elements.push(
        { tag: 'hr' },
        {
          tag: 'div',
          text: {
            content: `**📅 本周待办任务 (${weekTasks.length} 个)**`,
            tag: 'lark_md'
          }
        }
      );

      weekTasks.slice(0, 5).forEach((task) => {
        const dateStr = task.dueDate
          ? format(new Date(task.dueDate), 'MM-dd')
          : '';
        elements.push({
          tag: 'div',
          text: {
            content: `• ${task.title}\n  负责人：${task.assignee?.name || '未分配'}\n  截止：${dateStr}`,
            tag: 'lark_md'
          }
        });
      });
    }

    const card = {
      header: {
        title: {
          content: '📋 今日任务提醒',
          tag: 'plain_text'
        },
        template: 'blue'
      },
      elements
    };

    await sendFeishuMessage(chatId, card);

    console.log(
      `[Scheduler] 任务通知发送成功 - 今日 ${todayTasks.length} 个，本周 ${weekTasks.length} 个`
    );
  } catch (error) {
    console.error('[Scheduler] 任务通知发送失败:', error);
  }
}

export function startScheduler() {
  // 每天早上 8:00（中国时区）
  cron.schedule(
    '0 8 * * *',
    async () => {
      await sendDailyTaskNotification();
    },
    {
      timezone: 'Asia/Shanghai'
    }
  );

  console.log('[Scheduler] 定时任务已启动 - 每天 8:00 发送通知');
}
```

**Step 3: 在应用启动时启动定时任务**

修改 `app/api/tasks/route.ts`，在文件开头添加：

```typescript
import { startScheduler } from '@/services/scheduler';

// 启动定时任务（仅在生产环境）
if (process.env.NODE_ENV === 'production') {
  startScheduler();
}
```

**Step 4: 提交**

```bash
git add lib/feishu.ts services/scheduler.ts app/api/tasks/route.ts
git commit -m "feat: 实现飞书通知系统

- 飞书 API 集成（获取 token、发送消息）
- 定时任务（每天 8:00 发送通知）
- 消息卡片设计（今日任务 + 本周任务）
- 应用启动时自动启动定时任务

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 阶段六：完善和部署

### Task 14: 添加环境变量验证和文档

**Files:**
- Create: `README.md`
- Modify: `.env.example`

**Step 1: 完善环境变量模板**

修改 `.env.example`:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/poamaster"

# Session
SESSION_SECRET="change-this-to-random-32-char-string-minimum"

# OpenAI (可选，可在配置页设置)
OPENAI_API_KEY="sk-proj-..."

# App
NODE_ENV="development"
PORT=3000
```

**Step 2: 创建 README**

创建 `README.md`:

```markdown
# POA Master

AI 驱动的多工具平台，首个工具是智能任务管理系统。

## 功能特性

- 🤖 **AI 任务提取**：从文本、文件、图片中自动提取任务信息
- 📊 **任务管理**：支持多状态、负责人、截止时间管理
- 🔔 **飞书通知**：每天定时推送任务提醒
- 🔐 **安全认证**：简单的用户名密码认证系统
- ⚙️ **统一配置**：集中管理所有工具的配置

## 技术栈

- Next.js 14 (App Router)
- TypeScript
- PostgreSQL + Prisma
- Material UI
- OpenAI GPT-4o
- 飞书开放平台 API

## 快速开始

### 1. 环境要求

- Node.js 18+
- PostgreSQL 14+

### 2. 安装依赖

\`\`\`bash
npm install
\`\`\`

### 3. 配置环境变量

\`\`\`bash
cp .env.example .env
\`\`\`

编辑 `.env` 文件，填入数据库连接信息和 Session 密钥：

\`\`\`env
DATABASE_URL="postgresql://user:password@localhost:5432/poamaster"
SESSION_SECRET="your-random-32-char-secret"
\`\`\`

### 4. 初始化数据库

\`\`\`bash
npx prisma migrate deploy
npx prisma generate
\`\`\`

### 5. 启动开发服务器

\`\`\`bash
npm run dev
\`\`\`

访问 http://localhost:3000

### 6. 首次使用

- 首次访问会自动跳转到初始化页面
- 设置管理员用户名和密码
- 登录后访问设置页面配置 OpenAI API Key 和飞书应用

## 生产部署

### 方式一：本地部署

\`\`\`bash
# 构建应用
npm run build

# 启动应用
npm run start

# 使用 PM2 持久化运行
npm install -g pm2
pm2 start npm --name poamaster -- start
pm2 save
\`\`\`

### 方式二：Docker 部署

\`\`\`bash
docker-compose up -d
\`\`\`

## 配置说明

### OpenAI

1. 访问 https://platform.openai.com/
2. 创建 API Key
3. 在设置页面填入 API Key

### 飞书

1. 访问 https://open.feishu.cn/
2. 创建企业自建应用
3. 获取 App ID 和 App Secret
4. 添加机器人到群聊，获取 Chat ID
5. 在设置页面填入配置

## 开发指南

\`\`\`bash
# 启动开发服务器
npm run dev

# 数据库管理界面
npx prisma studio

# 创建数据库迁移
npx prisma migrate dev --name description
\`\`\`

## License

MIT
\`\`\`

**Step 3: 提交**

\`\`\`bash
git add README.md .env.example
git commit -m "docs: 添加项目文档

- README 使用说明
- 环境变量配置说明
- 快速开始指南
- 部署方案

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
\`\`\`

---

### Task 15: 最终测试和优化

**Step 1: 测试认证流程**

\`\`\`bash
# 启动开发服务器
npm run dev

# 测试步骤：
# 1. 访问 http://localhost:3000
# 2. 应跳转到 /init
# 3. 创建用户并登录
# 4. 测试登出和重新登录
\`\`\`

**Step 2: 测试任务管理**

\`\`\`
# 测试步骤：
# 1. 访问 /todo
# 2. 点击"添加任务"
# 3. 输入测试文本进行 AI 提取
# 4. 检查提取结果
# 5. 保存任务
# 6. 测试任务列表筛选、状态修改、删除
\`\`\`

**Step 3: 测试配置页面**

\`\`\`
# 测试步骤：
# 1. 访问 /settings
# 2. 填入 OpenAI API Key
# 3. 填入飞书配置（可选）
# 4. 保存配置
# 5. 返回任务页面测试 AI 提取是否正常
\`\`\`

**Step 4: 性能优化检查**

\`\`\`bash
# 检查项：
# - 数据库查询是否有索引
# - API 响应时间
# - 前端加载速度
# - 错误处理是否完善
\`\`\`

**Step 5: 最终提交**

\`\`\`bash
git add -A
git commit -m "chore: 最终测试和优化

- 验证所有功能正常
- 性能优化
- 错误处理完善

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
\`\`\`

---

## 计划总结

**实现的功能：**
- ✅ 完整的认证系统（初始化、登录、登出）
- ✅ 任务 CRUD（创建、读取、更新、删除）
- ✅ AI 任务提取（OpenAI GPT-4o）
- ✅ 任务列表管理（筛选、排序、状态管理）
- ✅ 负责人管理
- ✅ 飞书通知系统（定时推送）
- ✅ 统一配置页面
- ✅ 工具集合首页

**估计时间：**
- 阶段一：项目初始化（2-3 小时）
- 阶段二：认证系统（2-3 小时）
- 阶段三：To-Do 核心功能（3-4 小时）
- 阶段四：前端界面（3-4 小时）
- 阶段五：配置和飞书集成（2-3 小时）
- 阶段六：完善和部署（1-2 小时）

**总计：13-19 小时（约 2-3 个工作日）**

---

## 执行选项

计划已完成并保存到 `docs/plans/2026-01-28-poamaster-initial-implementation.md`。

**两种执行方式：**

**1. Subagent-Driven（本 session）**
- 我在当前 session 中为每个任务派发新的 subagent
- 每个任务完成后进行代码审查
- 快速迭代，实时反馈

**2. Parallel Session（独立 session）**
- 在新的 session 中打开 worktree 目录
- 使用 superpowers:executing-plans 批量执行
- 设置检查点进行审查

**你希望使用哪种方式？**
