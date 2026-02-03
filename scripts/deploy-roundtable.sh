#!/bin/bash

echo "🚀 部署圆桌会议功能..."

# 运行数据库迁移
echo "📊 运行数据库迁移..."
npx prisma migrate deploy

# 生成Prisma Client
echo "🔧 生成Prisma Client..."
npx prisma generate

# 初始化模板
echo "📝 初始化讨论模板..."
npx ts-node scripts/init-roundtable-templates.ts

# 创建上传目录
echo "📁 创建文件上传目录..."
mkdir -p public/uploads/roundtable

echo "✅ 圆桌会议功能部署完成!"
echo ""
echo "提示："
echo "1. 确保已配置 OpenAI API Key"
echo "2. 确保已配置飞书通知（可选）"
echo "3. 重启应用以应用所有更改"
