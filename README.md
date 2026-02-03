# POA Master

AI 驱动的多工具平台，首个工具是智能任务管理系统。

## 功能特性

- 🤖 **AI 任务提取**：从文本、文件、图片中自动提取任务信息
- 📊 **任务管理**：支持多状态、负责人、截止时间管理
- 🎯 **圆桌会议**：AI多角色讨论系统，自动审查决策提案和战略方案
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

### 🚀 方式一：一键部署（推荐）

```bash
./start.sh
```

自动部署脚本会帮你完成：
- ✅ 检查环境要求
- ✅ 安装依赖
- ✅ 配置环境变量（自动生成 SESSION_SECRET）
- ✅ 初始化数据库
- ✅ 构建项目
- ✅ 启动服务（支持开发/生产/PM2 三种模式）

**准备工作：**
1. 确保已安装 Node.js 18+ 和 PostgreSQL 14+
2. 创建 PostgreSQL 数据库
3. 运行脚本后，按提示配置 DATABASE_URL

---

### 📝 方式二：手动部署

#### 1. 环境要求

- Node.js 18+
- PostgreSQL 14+

#### 2. 安装依赖

```bash
npm install
```

#### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入数据库连接信息和 Session 密钥：

```env
DATABASE_URL="postgresql://user:password@localhost:5432/poamaster"
SESSION_SECRET="your-random-32-char-secret"
```

#### 4. 初始化数据库

```bash
npx prisma migrate deploy
npx prisma generate
```

#### 5. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

#### 6. 首次使用

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

## 使用说明

### 圆桌会议

通过AI模拟多角色讨论，为重大决策提供全方位审查：

1. 选择讨论模板或快速开始
2. 输入讨论材料（支持文本和文件）
3. AI自动执行4轮讨论（澄清、质疑、反驳、裁决）
4. 查看详细报告和行动建议
5. 将行动项转化为待办任务

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
