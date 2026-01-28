#!/bin/bash

set -e  # 遇到错误立即退出

echo "================================"
echo "POA Master 自动部署脚本"
echo "================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 打印函数
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# 检查命令是否存在
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# 步骤 1: 检查环境要求
echo "步骤 1/7: 检查环境要求..."
echo "----------------------------"

# 检查 Node.js
if command_exists node; then
    NODE_VERSION=$(node -v)
    print_success "Node.js 已安装: $NODE_VERSION"
else
    print_error "Node.js 未安装，请先安装 Node.js 18+"
    exit 1
fi

# 检查 npm
if command_exists npm; then
    NPM_VERSION=$(npm -v)
    print_success "npm 已安装: $NPM_VERSION"
else
    print_error "npm 未安装"
    exit 1
fi

# 检查 PostgreSQL
if command_exists psql; then
    PSQL_VERSION=$(psql --version)
    print_success "PostgreSQL 已安装: $PSQL_VERSION"
else
    print_info "PostgreSQL 命令未找到，请确保数据库已配置"
fi

echo ""

# 步骤 2: 安装依赖
echo "步骤 2/7: 安装项目依赖..."
echo "----------------------------"
npm install
print_success "依赖安装完成"
echo ""

# 步骤 3: 配置环境变量
echo "步骤 3/7: 配置环境变量..."
echo "----------------------------"

if [ ! -f .env ]; then
    print_info ".env 文件不存在，从模板创建..."
    cp .env.example .env
    print_success ".env 文件已创建"

    # 生成随机 SESSION_SECRET
    if command_exists openssl; then
        SESSION_SECRET=$(openssl rand -hex 32)
        sed -i.bak "s/change-this-to-random-32-char-string-minimum/$SESSION_SECRET/" .env
        rm .env.bak 2>/dev/null || true
        print_success "SESSION_SECRET 已自动生成"
    fi

    echo ""
    print_info "请编辑 .env 文件，配置以下必需项："
    echo "  - DATABASE_URL: PostgreSQL 数据库连接地址"
    echo "  - OPENAI_API_KEY: OpenAI API 密钥（可选，可在配置页设置）"
    echo ""
    read -p "按 Enter 继续（确保已配置 DATABASE_URL）..."
else
    print_success ".env 文件已存在"
fi

# 检查必需的环境变量
source .env 2>/dev/null || true

if [ -z "$DATABASE_URL" ] || [ "$DATABASE_URL" = "postgresql://user:password@localhost:5432/poamaster" ]; then
    print_error "DATABASE_URL 未配置或使用默认值"
    echo ""
    echo "请在 .env 文件中设置正确的数据库连接地址，例如："
    echo "DATABASE_URL=\"postgresql://username:password@localhost:5432/poamaster\""
    echo ""
    read -p "配置完成后按 Enter 继续..."
fi

echo ""

# 步骤 4: 初始化数据库
echo "步骤 4/7: 初始化数据库..."
echo "----------------------------"

print_info "生成 Prisma Client..."
npx prisma generate
print_success "Prisma Client 生成完成"

print_info "运行数据库迁移..."
if npx prisma migrate deploy 2>/dev/null; then
    print_success "数据库迁移完成"
else
    print_info "迁移失败，尝试推送 Schema..."
    npx prisma db push
    print_success "数据库 Schema 推送完成"
fi

echo ""

# 步骤 5: 构建项目
echo "步骤 5/7: 构建生产版本..."
echo "----------------------------"
npm run build
print_success "项目构建完成"
echo ""

# 步骤 6: 选择启动方式
echo "步骤 6/7: 选择启动方式..."
echo "----------------------------"
echo "请选择启动方式："
echo "  1) 开发模式（npm run dev）"
echo "  2) 生产模式（npm start）"
echo "  3) PM2 守护进程（推荐生产环境）"
echo ""
read -p "请输入选项 [1-3]: " START_MODE

case $START_MODE in
    1)
        print_info "选择：开发模式"
        START_CMD="npm run dev"
        ;;
    2)
        print_info "选择：生产模式"
        START_CMD="npm start"
        ;;
    3)
        print_info "选择：PM2 守护进程"
        if ! command_exists pm2; then
            print_info "PM2 未安装，正在安装..."
            npm install -g pm2
            print_success "PM2 安装完成"
        fi
        START_CMD="pm2 start npm --name poamaster -- start"
        ;;
    *)
        print_error "无效选项，默认使用生产模式"
        START_CMD="npm start"
        ;;
esac

echo ""

# 步骤 7: 启动服务
echo "步骤 7/7: 启动服务..."
echo "----------------------------"

# 检查端口是否被占用
PORT=${PORT:-3000}
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    print_error "端口 $PORT 已被占用"
    echo "请修改 .env 中的 PORT 配置或停止占用该端口的进程"
    exit 1
fi

print_success "端口 $PORT 可用"
echo ""

print_success "部署完成！"
echo ""
echo "================================"
echo "启动信息"
echo "================================"
echo "启动命令: $START_CMD"
echo "访问地址: http://localhost:$PORT"
echo ""
echo "首次使用："
echo "  1. 访问 http://localhost:$PORT"
echo "  2. 系统会自动跳转到初始化页面"
echo "  3. 设置管理员用户名和密码"
echo "  4. 登录后访问设置页面配置 OpenAI 和飞书"
echo ""

if [ "$START_MODE" = "3" ]; then
    echo "PM2 常用命令："
    echo "  pm2 logs poamaster     # 查看日志"
    echo "  pm2 restart poamaster  # 重启服务"
    echo "  pm2 stop poamaster     # 停止服务"
    echo "  pm2 delete poamaster   # 删除服务"
    echo ""
fi

read -p "按 Enter 启动服务..."
echo ""

# 启动服务
if [ "$START_MODE" = "3" ]; then
    eval $START_CMD
    print_success "服务已在后台启动"
    echo ""
    pm2 logs poamaster
else
    print_info "正在启动服务..."
    eval $START_CMD
fi
