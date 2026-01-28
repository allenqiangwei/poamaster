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

```bash
npm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入数据库连接信息和 Session 密钥：

```env
DATABASE_URL="postgresql://user:password@localhost:5432/poamaster"
SESSION_SECRET="your-random-32-char-secret"
```

### 4. 初始化数据库

```bash
npx prisma migrate deploy
npx prisma generate
```

### 5. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

### 6. 首次使用

- 首次访问会自动跳转到初始化页面
- 设置管理员用户名和密码
- 登录后访问设置页面配置 OpenAI API Key 和飞书应用

## 生产部署

### 方式一：本地部署

```bash
# 构建应用
npm run build

# 启动应用
npm run start

# 使用 PM2 持久化运行
npm install -g pm2
pm2 start npm --name poamaster -- start
pm2 save
```

### 方式二：Docker 部署

```bash
docker-compose up -d
```

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

```bash
# 启动开发服务器
npm run dev

# 数据库管理界面
npx prisma studio

# 创建数据库迁移
npx prisma migrate dev --name description
```

## License

MIT
