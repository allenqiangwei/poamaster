#!/bin/bash

set -e  # 遇到错误立即退出

# 颜色定义（必须在使用前定义）
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印函数（必须在使用前定义）
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

# 环境变量
# PRODUCTION=true  - 生产环境模式（最严格）
# ALLOW_DB_PUSH=true - 允许执行 prisma db push（危险操作）
# BACKUP_ONLY=true - 仅备份数据库，不启动服务
# RESTORE_BACKUP=<文件路径> - 从备份文件还原数据库
PRODUCTION=${PRODUCTION:-false}
ALLOW_DB_PUSH=${ALLOW_DB_PUSH:-false}
BACKUP_ONLY=${BACKUP_ONLY:-false}
RESTORE_BACKUP=${RESTORE_BACKUP:-}

# 备份目录
BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"

# 从 DATABASE_URL 解析数据库连接信息
parse_database_url() {
    # DATABASE_URL 格式: postgresql://user:password@host:port/database
    local url="$1"

    # 移除 postgresql:// 前缀
    url="${url#postgresql://}"

    # 解析用户名和密码
    local userpass="${url%%@*}"
    DB_USER="${userpass%%:*}"
    DB_PASS="${userpass#*:}"

    # 解析主机、端口和数据库名
    local hostportdb="${url#*@}"
    local hostport="${hostportdb%%/*}"
    DB_NAME="${hostportdb#*/}"
    DB_NAME="${DB_NAME%%\?*}"  # 移除查询参数

    DB_HOST="${hostport%%:*}"
    DB_PORT="${hostport#*:}"

    # 如果没有端口，默认 5432
    if [ "$DB_PORT" = "$DB_HOST" ]; then
        DB_PORT="5432"
    fi
}

# 备份数据库函数
backup_database() {
    local backup_file="$BACKUP_DIR/backup_$(date +%Y%m%d_%H%M%S).sql"

    echo ""
    print_info "正在备份数据库到: $backup_file"

    # 解析数据库连接信息
    source .env 2>/dev/null || true
    parse_database_url "$DATABASE_URL"

    # 使用 pg_dump 备份
    PGPASSWORD="$DB_PASS" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -F p -f "$backup_file" 2>/dev/null

    if [ $? -eq 0 ] && [ -f "$backup_file" ]; then
        local size=$(du -h "$backup_file" | cut -f1)
        print_success "数据库备份完成: $backup_file ($size)"
        echo "$backup_file"
        return 0
    else
        print_error "数据库备份失败"
        return 1
    fi
}

# 还原数据库函数
restore_database() {
    local backup_file="$1"

    if [ ! -f "$backup_file" ]; then
        print_error "备份文件不存在: $backup_file"
        return 1
    fi

    echo ""
    print_info "正在从备份还原数据库: $backup_file"

    # 解析数据库连接信息
    source .env 2>/dev/null || true
    parse_database_url "$DATABASE_URL"

    # 使用 psql 还原
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$backup_file" 2>/dev/null

    if [ $? -eq 0 ]; then
        print_success "数据库还原完成"
        return 0
    else
        print_error "数据库还原失败"
        return 1
    fi
}

# 列出可用备份
list_backups() {
    echo ""
    echo "可用的备份文件："
    echo "----------------------------"
    if [ -d "$BACKUP_DIR" ] && [ "$(ls -A $BACKUP_DIR 2>/dev/null)" ]; then
        ls -lh "$BACKUP_DIR"/*.sql 2>/dev/null | awk '{print "  " $9 " (" $5 ", " $6 " " $7 " " $8 ")"}'
    else
        echo "  (没有备份文件)"
    fi
    echo ""
}

echo "================================"
echo "POA Master 自动部署脚本"
echo "================================"
echo ""

# 显示当前环境
if [ "$PRODUCTION" = "true" ]; then
    echo -e "${RED}┌─────────────────────────────────┐${NC}"
    echo -e "${RED}│  🔴 生产环境模式 (PRODUCTION)   │${NC}"
    echo -e "${RED}│  数据库操作将受到严格保护       │${NC}"
    echo -e "${RED}└─────────────────────────────────┘${NC}"
else
    echo -e "${GREEN}┌─────────────────────────────────┐${NC}"
    echo -e "${GREEN}│  🟢 开发环境模式 (DEVELOPMENT)  │${NC}"
    echo -e "${GREEN}│  数据库操作同样受到保护         │${NC}"
    echo -e "${GREEN}└─────────────────────────────────┘${NC}"
fi
echo ""
echo "启动选项说明："
echo "  ./start.sh                              # 安全模式（默认）"
echo "  PRODUCTION=true ./start.sh              # 生产环境"
echo "  ALLOW_DB_PUSH=true ./start.sh           # 允许 db push（自动备份）"
echo "  BACKUP_ONLY=true ./start.sh             # 仅备份数据库"
echo "  RESTORE_BACKUP=<文件> ./start.sh        # 从备份还原"
echo "  RESTORE_BACKUP=latest ./start.sh        # 从最新备份还原"
echo ""

# 如果只是备份数据库
if [ "$BACKUP_ONLY" = "true" ]; then
    echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║           💾  数据库备份模式  💾                        ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # 检查 .env 文件
    if [ ! -f .env ]; then
        print_error ".env 文件不存在，无法备份数据库"
        exit 1
    fi

    # 列出现有备份
    list_backups

    # 执行备份
    BACKUP_FILE=$(backup_database)
    if [ $? -eq 0 ]; then
        echo ""
        echo -e "${GREEN}还原命令:${NC}"
        echo -e "${GREEN}  RESTORE_BACKUP=$BACKUP_FILE ./start.sh${NC}"
        echo ""
        list_backups
    fi
    exit 0
fi

# 如果指定了还原备份，先执行还原
if [ -n "$RESTORE_BACKUP" ]; then
    echo -e "${YELLOW}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║           📦  数据库还原模式  📦                        ║${NC}"
    echo -e "${YELLOW}╚════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # 检查 .env 文件
    if [ ! -f .env ]; then
        print_error ".env 文件不存在，无法还原数据库"
        exit 1
    fi

    # 列出可用备份
    list_backups

    # 检查指定的备份文件
    if [ "$RESTORE_BACKUP" = "latest" ]; then
        # 获取最新的备份文件
        RESTORE_BACKUP=$(ls -t "$BACKUP_DIR"/*.sql 2>/dev/null | head -1)
        if [ -z "$RESTORE_BACKUP" ]; then
            print_error "没有找到备份文件"
            exit 1
        fi
        print_info "使用最新备份: $RESTORE_BACKUP"
    fi

    if [ ! -f "$RESTORE_BACKUP" ]; then
        print_error "备份文件不存在: $RESTORE_BACKUP"
        echo ""
        echo "用法示例："
        echo "  RESTORE_BACKUP=./backups/backup_20240101_120000.sql ./start.sh"
        echo "  RESTORE_BACKUP=latest ./start.sh  # 使用最新备份"
        exit 1
    fi

    echo -e "${RED}警告：还原操作将覆盖当前数据库中的所有数据！${NC}"
    read -p "确定要从备份还原吗？[y/N]: " CONFIRM_RESTORE
    if [ "$CONFIRM_RESTORE" = "y" ] || [ "$CONFIRM_RESTORE" = "Y" ]; then
        restore_database "$RESTORE_BACKUP"
        if [ $? -eq 0 ]; then
            print_success "数据库已还原，继续启动服务..."
        else
            print_error "还原失败，退出"
            exit 1
        fi
    else
        print_info "已取消还原"
        exit 0
    fi
    echo ""
fi

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

# 数据库迁移（所有环境默认使用安全的 migrate deploy）
print_info "运行数据库迁移 (prisma migrate deploy)..."

if npx prisma migrate deploy 2>/dev/null; then
    print_success "数据库迁移完成"
else
    # 迁移失败，检查是否允许 db push
    echo ""
    echo -e "${YELLOW}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║           ⚠️  数据库迁移失败  ⚠️                        ║${NC}"
    echo -e "${YELLOW}╠════════════════════════════════════════════════════════╣${NC}"
    echo -e "${YELLOW}║  可能原因：没有迁移文件或迁移文件与数据库不匹配         ║${NC}"
    echo -e "${YELLOW}╚════════════════════════════════════════════════════════╝${NC}"
    echo ""

    if [ "$PRODUCTION" = "true" ]; then
        # 生产环境：绝对不允许 db push
        print_error "生产环境不允许执行 prisma db push"
        echo ""
        echo "解决方法："
        echo "  1. 在开发环境创建迁移: npx prisma migrate dev --name <名称>"
        echo "  2. 将迁移文件提交到 git"
        echo "  3. 重新部署到生产环境"
        exit 1

    elif [ "$ALLOW_DB_PUSH" = "true" ]; then
        # 明确允许 db push
        echo -e "${RED}╔════════════════════════════════════════════════════════╗${NC}"
        echo -e "${RED}║           ⚠️  危险操作：prisma db push  ⚠️              ║${NC}"
        echo -e "${RED}╠════════════════════════════════════════════════════════╣${NC}"
        echo -e "${RED}║  此操作可能导致数据丢失！                               ║${NC}"
        echo -e "${RED}║  你已通过 ALLOW_DB_PUSH=true 明确允许此操作             ║${NC}"
        echo -e "${RED}╚════════════════════════════════════════════════════════╝${NC}"
        echo ""

        # 自动备份数据库
        print_info "在执行 db push 之前，先备份当前数据库..."
        BACKUP_FILE=$(backup_database)
        BACKUP_SUCCESS=$?

        if [ $BACKUP_SUCCESS -eq 0 ]; then
            echo ""
            echo -e "${GREEN}备份已创建: $BACKUP_FILE${NC}"
            echo -e "${GREEN}如果需要还原，请运行:${NC}"
            echo -e "${GREEN}  RESTORE_BACKUP=$BACKUP_FILE ./start.sh${NC}"
            echo ""
        else
            echo ""
            echo -e "${YELLOW}备份失败（可能是新数据库或 pg_dump 未安装）${NC}"
            echo ""
        fi

        read -p "最后确认：确定要执行 db push 吗？[y/N]: " CONFIRM_PUSH
        if [ "$CONFIRM_PUSH" = "y" ] || [ "$CONFIRM_PUSH" = "Y" ]; then
            npx prisma db push
            print_success "数据库 Schema 推送完成"
            echo ""
            if [ $BACKUP_SUCCESS -eq 0 ]; then
                echo -e "${GREEN}提示：如果出现问题，可以使用以下命令还原:${NC}"
                echo -e "${GREEN}  RESTORE_BACKUP=$BACKUP_FILE ./start.sh${NC}"
            fi
        else
            print_info "已取消 db push"
            exit 1
        fi

    else
        # 开发环境但未允许 db push：提供安全选项
        print_info "为保护数据安全，默认不执行 prisma db push"
        echo ""
        echo "你有以下选择："
        echo ""
        echo "  选项 1（推荐）- 创建迁移文件："
        echo "    npx prisma migrate dev --name init"
        echo "    这会创建迁移文件，可以安全地应用到其他环境"
        echo ""
        echo "  选项 2（危险）- 强制推送 Schema："
        echo "    ALLOW_DB_PUSH=true ./start.sh"
        echo "    这可能会导致数据丢失，仅限全新数据库使用"
        echo ""
        exit 1
    fi
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

# 飞书监听服务（可选）
echo "飞书消息监听服务..."
echo "----------------------------"
# 检查 feishu-listener 目录是否存在
if [ -d "services/feishu-listener" ]; then
    # 安装 listener 依赖
    print_info "安装飞书监听服务依赖..."
    (cd services/feishu-listener && npm install --silent 2>/dev/null)
    print_success "飞书监听服务依赖安装完成"

    if [ "$START_MODE" = "3" ]; then
        # PM2 模式：自动启动 listener
        echo ""
        read -p "是否启动飞书消息监听服务？[y/N]: " START_FEISHU
        if [ "$START_FEISHU" = "y" ] || [ "$START_FEISHU" = "Y" ]; then
            pm2 start npx --name feishu-listener -- tsx src/index.ts --cwd services/feishu-listener
            print_success "飞书监听服务已启动（PM2: feishu-listener）"
            echo "  pm2 logs feishu-listener  # 查看日志"
        else
            print_info "跳过飞书监听服务"
        fi
    else
        print_info "飞书监听服务需要单独启动："
        echo "  cd services/feishu-listener && npx tsx src/index.ts"
    fi
else
    print_info "飞书监听服务目录不存在，跳过"
fi
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
