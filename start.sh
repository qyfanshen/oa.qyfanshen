#!/bin/bash

# ========== OA 系统启动脚本（宝塔面板专用） ==========
# 宝塔面板 → 网站 → Node项目 → 启动命令 填入此文件的绝对路径
# 例如：/www/wwwroot/oa.qyfanshen.com/start.sh

set -e

# 1. 设置 Node.js 路径（宝塔默认路径，按实际版本调整）
export PATH=/www/server/nodejs/v20.20.2/bin:$PATH

# 2. 切换到项目目录
APP_DIR=/www/wwwroot/oa.qyfanshen.com
cd "$APP_DIR"

# 3. 检查关键依赖
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js 未安装或 PATH 未配置"
    exit 1
fi
echo "[INFO] Node.js 版本: $(node -v)"

if [ ! -f ".env.local" ]; then
    echo "[WARN] .env.local 不存在，将使用 .env"
fi

if [ ! -d "node_modules" ]; then
    echo "[ERROR] node_modules 不存在，请先执行 npm install"
    exit 1
fi

if [ ! -f ".next/BUILD_ID" ]; then
    echo "[ERROR] 构建产物不存在，请先执行 npm run build"
    exit 1
fi

# 4. 确保上传目录存在
mkdir -p uploads/expenses
mkdir -p uploads/cache

# 5. 启动 Next.js（生产模式，端口 3000）
echo "[INFO] 正在启动 OA 系统..."
exec node node_modules/next/dist/bin/next start -p 3000
