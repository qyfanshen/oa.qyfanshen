#!/bin/bash
# ============ 梵燊 OA 系统 - 宝塔一键部署脚本 ============
# 在服务器 SSH 中执行此脚本完成部署
# 
# 使用方法：
#   1. 先将项目代码上传到 /www/wwwroot/oa.qyfanshen.com
#   2. 再执行：bash deploy.sh

set -e

APP_DIR="/www/wwwroot/oa.qyfanshen.com"
NODE_BIN="/www/server/nodejs/v20.20.2/bin"
BACKUP_DIR="/www/wwwroot/backups/oa-$(date +%Y%m%d-%H%M%S)"

echo "============================================"
echo " 梵燊集团 OA 系统 - 宝塔部署脚本"
echo "============================================"

# ---------- 0. 查找正确的 Node.js 路径 ----------
if [ ! -d "$NODE_BIN" ]; then
  echo "[INFO] 默认 Node.js 路径不存在，自动查找..."
  FOUND_NODE=$(find /www/server/nodejs -name "node" -type f 2>/dev/null | head -1 || true)
  if [ -n "$FOUND_NODE" ]; then
    NODE_BIN=$(dirname "$FOUND_NODE")
    echo "[INFO] 找到 Node.js: $FOUND_NODE"
  else
    SYSTEM_NODE=$(which node 2>/dev/null || echo "/usr/bin/node")
    NODE_BIN=$(dirname "$SYSTEM_NODE")
    echo "[INFO] 使用系统 Node.js: $SYSTEM_NODE"
  fi
fi

export PATH="$NODE_BIN:$PATH"
echo "[INFO] Node.js 版本: $(node -v)"
echo "[INFO] NPM 版本: $(npm -v)"

# ---------- 1. 进入项目目录 ----------
cd "$APP_DIR" || { echo "[ERROR] 无法进入目录: $APP_DIR"; exit 1; }
echo "[INFO] 项目目录: $(pwd)"

# ---------- 2. 停止旧进程 ----------
echo "[INFO] 停止旧的 PM2 进程..."
pm2 delete fanshen-oa 2>/dev/null || true
pm2 delete fanshen-chat 2>/dev/null || true
pm2 delete all 2>/dev/null || true

# 清理端口占用
for port in 3000 3002; do
  PID=$(lsof -ti :$port 2>/dev/null || ss -tlnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | head -1)
  if [ -n "$PID" ]; then
    echo "[INFO] 终止端口 $port 的占用进程 PID: $PID"
    kill -9 "$PID" 2>/dev/null || true
  fi
done
sleep 2

# ---------- 3. 备份重要文件 ----------
echo "[INFO] 备份配置文件..."
mkdir -p "$BACKUP_DIR"
[ -f ".env.local" ] && cp .env.local "$BACKUP_DIR/" || true
[ -f "ecosystem.config.js" ] && cp ecosystem.config.js "$BACKUP_DIR/" || true
[ -f "start.sh" ] && cp start.sh "$BACKUP_DIR/" || true
echo "[INFO] 备份位置: $BACKUP_DIR"

# ---------- 4. 安装依赖 ----------
echo "[INFO] 安装依赖..."
if [ -f "package-lock.json" ]; then
  npm ci --omit=optional 2>&1 | tail -5
else
  npm install --omit=optional 2>&1 | tail -5
fi

# ---------- 5. 检查/执行构建 ----------
if [ ! -f ".next/BUILD_ID" ]; then
  echo "[INFO] 执行生产构建..."
  npm run build 2>&1 | tail -10
else
  echo "[INFO] 构建产物已存在，跳过构建"
fi

# ---------- 6. 检查必要文件 ----------
echo "[INFO] 检查必要文件..."
MISSING=""
[ ! -f ".env.local" ] && MISSING="$MISSING .env.local"
[ ! -f "server/chat-ws.js" ] && MISSING="$MISSING server/chat-ws.js"
[ ! -f "ecosystem.config.js" ] && MISSING="$MISSING ecosystem.config.js"
if [ -n "$MISSING" ]; then
  echo "[ERROR] 缺少必要文件:$MISSING"
  echo "请创建 .env.local 配置文件（参考 .env.example）"
  exit 1
fi

# ---------- 7. 设置权限 ----------
echo "[INFO] 设置目录权限..."
chmod +x start.sh
chmod 755 uploads 2>/dev/null || mkdir -p uploads && chmod 755 uploads
chown -R www:www uploads 2>/dev/null || true

# ---------- 8. 使用 PM2 启动 ----------
echo "[INFO] 使用 PM2 启动服务..."

# 更新 ecosystem.config.js 中的路径
sed -i "s|/www/server/nodejs/v20.20.2/bin|$NODE_BIN|g" ecosystem.config.js

pm2 start ecosystem.config.js
pm2 save

echo "[INFO] PM2 进程列表:"
pm2 list

# ---------- 9. 等待服务就绪 ----------
echo "[INFO] 等待服务启动..."
sleep 5

# 检查端口
echo "[INFO] 端口检查:"
ss -tlnp 2>/dev/null | grep -E ":(3000|3002) " || netstat -tlnp 2>/dev/null | grep -E ":(3000|3002) "

# ---------- 10. 验证 API ----------
echo "[INFO] 验证 API..."
sleep 3

if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/auth/me 2>/dev/null | grep -q "200\|401"; then
  echo "[OK] Next.js 主服务运行正常"
else
  echo "[WARN] Next.js 主服务可能未就绪，检查日志: pm2 logs fanshen-oa"
fi

if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3002/ 2>/dev/null | grep -q "101\|426\|200"; then
  echo "[OK] 聊天 WebSocket 服务运行正常"
else
  echo "[WARN] 聊天 WebSocket 服务可能未就绪，检查日志: pm2 logs fanshen-chat"
fi

# ---------- 11. 设置 PM2 开机自启 ----------
echo "[INFO] 设置 PM2 开机自启..."
pm2 startup 2>/dev/null || true

echo ""
echo "============================================"
echo " 部署完成！"
echo "============================================"
echo ""
echo "下一步："
echo "  1. 宝塔面板 → 网站 → 添加站点 → 反向代理到 127.0.0.1:3000"
echo "  2. Nginx 配置添加 WebSocket 支持（/chat-ws 路径反代到 3002）"
echo "  3. 宝塔 → 安全 → 放行端口 3000, 3002"
echo ""
echo "常用命令："
echo "  pm2 list          # 查看进程状态"
echo "  pm2 logs          # 查看实时日志"
echo "  pm2 restart all   # 重启所有服务"
echo "  pm2 reload all    # 零中断重载"
echo ""
