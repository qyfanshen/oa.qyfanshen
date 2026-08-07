# 梵燊集团 OA 系统 · 宝塔面板部署指南

> 适用版本：Next.js 16 + React 19 + MySQL 5.7/8.0 + Node.js 20.x
> 部署域名示例：`oa.qyfanshen.com`（请替换为你的实际域名）
> 项目部署路径：`/www/wwwroot/oa.qyfanshen.com`
> 应用监听端口：`3000`

---

## 目录

1. [环境准备](#一环境准备)
2. [创建数据库](#二创建数据库)
3. [上传项目](#三上传项目)
4. [配置环境变量](#四配置环境变量)
5. [安装依赖与构建](#五安装依赖与构建)
6. [初始化数据库](#六初始化数据库)
7. [配置 Node 项目（PM2 守护）](#七配置-node-项目pm2-守护)
8. [配置 Nginx 反向代理](#八配置-nginx-反向代理)
9. [配置 SSL 证书（强制 HTTPS）](#九配置-ssl-证书强制-https)
10. [安全加固](#十安全加固)
11. [部署验证](#十一部署验证)
12. [日常运维](#十二日常运维)
13. [常见问题排查](#十三常见问题排查)

---

## 一、环境准备

### 1.1 安装宝塔面板

若服务器尚未安装宝塔面板，SSH 登录服务器执行（CentOS/Ubuntu/Debian 通用）：

```bash
# CentOS
yum install -y wget && wget -O install.sh https://download.bt.cn/install/install_6.0.sh && sh install.sh ed8484bec

# Ubuntu/Debian
wget -O install.sh https://download.bt.cn/install/install-ubuntu_6.0.sh && sudo bash install.sh ed8484bec
```

安装完成后记录面板地址、账号、密码，登录宝塔面板。

### 1.2 安装必要软件

进入宝塔面板 → **软件商店**，安装以下软件：

| 软件 | 版本要求 | 用途 |
|---|---|---|
| **Nginx** | 1.22+ | 反向代理 |
| **MySQL** | 5.7 或 8.0 | 数据存储 |
| **Node.js 版本管理器** | - | 管理 Node.js 运行环境 |
| **PM2 管理器** | - | Node 进程守护 |
| **Linux 工具箱** | - | 系统优化 |

### 1.3 安装 Node.js 20.x

1. 打开 **软件商店** → 已安装 → **Node.js 版本管理器** → 设置
2. 在版本列表中安装 **v20.20.2**（或任意 20.x LTS 版本）
3. 安装完成后点击 **设为默认版本**

验证安装（SSH 终端执行）：

```bash
/www/server/nodejs/v20.20.2/bin/node -v
# 输出: v20.20.2
```

---

## 二、创建数据库

### 2.1 通过宝塔面板创建

1. 宝塔面板 → **数据库** → **添加数据库**
2. 填写信息：

| 项 | 值 |
|---|---|
| 数据库名 | `fanshen_oa` |
| 用户名 | `fanshen_oa_app` |
| 密码 | 自动生成或自定义（**请记录，至少 16 位**） |
| 访问权限 | **本地服务器** |
| 字符集 | `utf8mb4` |

3. 点击 **提交** 创建数据库

### 2.2 验证数据库连接

宝塔面板 → 数据库 → 找到 `fanshen_oa` → **phpMyAdmin** → 输入密码登录，确认能正常访问。

---

## 三、上传项目

### 3.1 准备项目压缩包

在本地项目根目录 `c:\Users\Administrator\Desktop\oa` 下，将以下内容打包为 `oa.zip`：

**必须包含：**
- `src/`、`public/`、`scripts/`、`uploads/`（空目录即可）
- `package.json`、`package-lock.json`
- `next.config.ts`、`tsconfig.json`、`postcss.config.mjs`、`eslint.config.mjs`
- `middleware.ts`、`start.sh`
- `.env.example`、`.gitignore`
- `robots.txt`、`sitemap.xml`

**切勿包含：**
- `node_modules/`（体积过大，服务器重新安装）
- `.next/`（构建产物，服务器重新构建）
- `.env.local`（含敏感信息，单独创建）

### 3.2 上传到服务器

1. 宝塔面板 → **文件** → 进入 `/www/wwwroot/`
2. 新建目录 `oa.qyfanshen.com`
3. 将 `oa.zip` 上传到该目录
4. 右键 → **解压** → 解压到当前目录
5. 解压后确认目录结构如下：

```
/www/wwwroot/oa.qyfanshen.com/
├── src/
├── public/
├── scripts/
├── uploads/
├── package.json
├── start.sh
├── .env.example
├── next.config.ts
└── ...
```

### 3.3 设置目录权限

SSH 执行（确保 Next.js 可读写上传目录）：

```bash
cd /www/wwwroot/oa.qyfanshen.com
mkdir -p uploads/expenses uploads/cache
chown -R www:www uploads
chmod -R 755 uploads
```

---

## 四、配置环境变量

### 4.1 创建 .env.local

SSH 进入项目目录：

```bash
cd /www/wwwroot/oa.qyfanshen.com
cp .env.example .env.local
```

### 4.2 生成密钥

在 SSH 中执行以下命令生成随机密钥（**记录输出值**）：

```bash
# 生成 AUTH_SECRET（JWT 签名密钥）
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 生成管理员密码（至少 12 位）
openssl rand -base64 18
```

### 4.3 编辑 .env.local

宝塔面板 → 文件 → 进入项目目录 → 右键 `.env.local` → 编辑，按以下表格修改：

| 变量 | 值 | 说明 |
|---|---|---|
| `DB_HOST` | `127.0.0.1` | 不变 |
| `DB_PORT` | `3306` | 不变 |
| `DB_NAME` | `fanshen_oa` | 第二节创建的数据库名 |
| `DB_USER` | `fanshen_oa_app` | 第二节创建的用户名 |
| `DB_PASSWORD` | **真实密码** | 第二节创建数据库时设置的密码 |
| `APP_ENV` | `production` | 不变 |
| `APP_DEBUG` | `false` | 不变 |
| `APP_URL` | `https://oa.qyfanshen.com` | 替换为你的实际域名 |
| `AUTH_SECRET` | **步骤 4.2 生成的值** | JWT 签名密钥（必填） |
| `AUTH_ENFORCE` | `true` | **必须为 true**，强制鉴权 |
| `ADMIN_USERNAME` | `fanshen_superadmin` | 管理员账号（可自定义） |
| `ADMIN_PASSWORD` | **步骤 4.2 生成的值** | 至少 12 位 |
| `DEEPSEEK_API_KEY` | **你的 DeepSeek API Key** | 在 https://platform.deepseek.com 申请 |
| `TEST_EMPLOYEE_USERNAME` | **留空或注释** | 生产环境禁止设置 |
| `TEST_EMPLOYEE_PASSWORD` | **留空或注释** | 生产环境禁止设置 |

### 4.4 修改 start.sh 中的路径（如域名不同）

```bash
vi /www/wwwroot/oa.qyfanshen.com/start.sh
```

确认以下两行与实际一致：

```bash
export PATH=/www/server/nodejs/v20.20.2/bin:$PATH   # Node.js 实际版本路径
APP_DIR=/www/wwwroot/oa.qyfanshen.com               # 项目实际路径
```

赋予执行权限：

```bash
chmod +x /www/wwwroot/oa.qyfanshen.com/start.sh
```

---

## 五、安装依赖与构建

### 5.1 安装依赖

```bash
cd /www/wwwroot/oa.qyfanshen.com
export PATH=/www/server/nodejs/v20.20.2/bin:$PATH
npm config set registry https://registry.npmmirror.com    # 使用国内镜像加速
npm install --omit=optional
```

> 预计耗时 2-5 分钟。若出现 `npm ERR!` 多为网络问题，重试即可。

### 5.2 生产构建

```bash
npm run build
```

构建成功标志（关键输出）：

```
✓ Compiled successfully
✓ Generating static pages
✓ Finalizing page optimization

Route (app)                              Size     First Load JS
└── ○ /                                  1.2 kB         88 kB
└── ● /login                             1.5 kB         88 kB
...
○  (Static)  - prerendered as static content
●  (Dynamic) - server-rendered on demand
```

构建完成后会在项目根目录生成 `.next/` 目录。

> **若构建失败**：请检查 `package.json`、`tsconfig.json`、`next.config.ts` 是否完整，确认项目根目录无多余文件（如 `ai/`、`page.tsx` 等）。

---

## 六、初始化数据库

> **执行顺序必须为：init:db → init:auth → init:ai**

### 6.1 创建数据表结构

```bash
cd /www/wwwroot/oa.qyfanshen.com
npm run init:db
```

成功后会创建以下数据表：`departments`、`employees`、`users`、`leave_requests`、`expense_reports`、`seal_requests`、`approval_requests`、`approval_flow_templates`、`attendance_records`、`announcements`、`partners`、`projects`、`documents`、`meetings`，并初始化默认部门数据和审批流程模板。

### 6.2 创建管理员账号

```bash
npm run init:auth
```

成功输出：

```
未设置 TEST_EMPLOYEE_USERNAME / TEST_EMPLOYEE_PASSWORD，跳过测试账号创建。
管理员账号 fanshen_superadmin 已准备完成。
```

### 6.3 创建 AI 功能数据表

```bash
npm run init:ai
```

### 6.4 验证数据表

宝塔面板 → 数据库 → `fanshen_oa` → **phpMyAdmin** → 检查表数量（应为 14+ 张表）。

---

## 七、配置 Node 项目（PM2 守护）

### 7.1 通过宝塔 PM2 管理器添加

1. 宝塔面板 → **软件商店** → 已安装 → **PM2 管理器** → 设置
2. 点击 **添加项目**，填写：

| 项 | 值 |
|---|---|
| 项目名称 | `fanshen-oa` |
| 启动文件/命令 | `/www/wwwroot/oa.qyfanshen.com/start.sh` |
| 项目目录 | `/www/wwwroot/oa.qyfanshen.com` |
| Node 版本 | `v20.20.2` |

3. 点击 **提交**，然后点击 **启动**

### 7.2 验证进程

```bash
pm2 list
# 应看到 fanshen-oa 进程，status 为 online

pm2 logs fanshen-oa --lines 20
# 应看到 "[INFO] 正在启动 OA 系统..." 和 Next.js 启动日志
```

### 7.3 设置开机自启

```bash
pm2 save
pm2 startup
# 按提示执行返回的命令
```

### 7.4 验证端口监听

```bash
ss -tlnp | grep 3000
# 应看到 127.0.0.1:3000 或 0.0.0.0:3000 LISTEN
```

---

## 八、配置 Nginx 反向代理

### 8.1 创建网站

1. 宝塔面板 → **网站** → **添加站点**
2. 填写：

| 项 | 值 |
|---|---|
| 域名 | `oa.qyfanshen.com`（你的实际域名） |
| 根目录 | `/www/wwwroot/oa.qyfanshen.com` |
| PHP 版本 | **纯静态**（无需 PHP） |
| 数据库 | 不创建 |

### 8.2 配置反向代理

1. 网站列表 → 找到刚创建的站点 → **设置** → **反向代理**
2. 点击 **添加反向代理**，填写：

| 项 | 值 |
|---|---|
| 代理名称 | `oa-next` |
| 目标 URL | `http://127.0.0.1:3000` |
| 发送域名 | `$host` |

3. 启用代理

### 8.3 手动优化 Nginx 配置（支持大文件上传与长连接）

宝塔面板 → 站点设置 → **配置文件**，在 `server` 块内添加/修改：

```nginx
# 客户端上传文件大小限制（报销附件等）
client_max_body_size 50M;

# 反向代理超时设置（AI 接口响应较慢）
proxy_connect_timeout 60s;
proxy_send_timeout 300s;
proxy_read_timeout 300s;

# 传递真实 IP 与协议（登录限流依赖此设置）
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;

# 代理缓冲区
proxy_buffer_size 128k;
proxy_buffers 32 32k;
proxy_busy_buffers_size 128k;
```

保存后重载 Nginx：

```bash
nginx -t && nginx -s reload
```

---

## 九、配置 SSL 证书（强制 HTTPS）

### 9.1 申请 Let's Encrypt 免费证书

1. 宝塔面板 → 站点设置 → **SSL** → **Let's Encrypt**
2. 勾选你的域名 → 点击 **申请**
3. 申请成功后，开启 **强制 HTTPS**

### 9.2 验证 HTTPS

浏览器访问 `https://oa.qyfanshen.com`，确认：
- 地址栏显示安全锁标志
- HTTP 自动跳转到 HTTPS

> **重要**：Cookie 的 `secure` 属性在 HTTPS 下才会生效，确保会话安全。

---

## 十、安全加固

### 10.1 防火墙配置

宝塔面板 → **安全**：

| 端口 | 策略 | 说明 |
|---|---|---|
| 22 | 放行（限 IP） | SSH |
| 80 | 放行 | HTTP（自动跳转 HTTPS） |
| 443 | 放行 | HTTPS |
| 3306 | **拒绝** | MySQL 仅本机访问 |
| 3000 | **拒绝** | Next.js 仅通过 Nginx 反代 |

### 10.2 .env.local 权限保护

```bash
cd /www/wwwroot/oa.qyfanshen.com
chmod 600 .env.local
chown www:www .env.local
```

### 10.3 禁止敏感目录外访

在 Nginx 站点配置的 `server` 块内添加：

```nginx
# 禁止访问源码与配置
location ~ /\.(env|git|htaccess) {
    deny all;
    return 404;
}

location ~ ^/(scripts|src)/ {
    deny all;
    return 404;
}

# uploads 仅允许特定类型（防止上传可执行文件被访问）
location /uploads/ {
    location ~ \.(php|jsp|asp|sh|exe|svg)$ {
        deny all;
    }
}
```

### 10.4 数据库安全

- 宝塔面板 → 数据库 → 修改 root 密码为强密码
- 禁止 root 远程登录（仅本机）
- 定期备份（宝塔 → 计划任务 → 添加 MySQL 备份）

### 10.5 定期备份计划任务

宝塔面板 → **计划任务** → 添加：

| 任务类型 | 名称 | 执行周期 | 保留份数 |
|---|---|---|---|
| MySQL 数据库备份 | OA 数据库备份 | 每天 03:00 | 7 |
| 网站备份 | OA 项目+上传备份 | 每周一 04:00 | 4 |

---

## 十一、部署验证

### 11.1 服务状态检查

```bash
# 1. Node 进程
pm2 list

# 2. 端口监听
ss -tlnp | grep 3000

# 3. Nginx 状态
nginx -t

# 4. 数据库连接
mysql -u fanshen_oa_app -p -e "USE fanshen_oa; SHOW TABLES;"
```

### 11.2 功能验证清单

浏览器访问 `https://oa.qyfanshen.com`，按以下清单验证：

- [ ] 首页正常加载（无 502/504）
- [ ] 跳转到登录页 `/login`
- [ ] 使用管理员账号登录成功
- [ ] 仪表盘数据正常显示
- [ ] 员工管理可查看列表
- [ ] 提交一条请假申请
- [ ] 管理员审批该申请
- [ ] 上传报销附件（测试文件上传）
- [ ] AI 助手对话（如已配置 DeepSeek Key）

### 11.3 日志检查

```bash
# 应用日志
pm2 logs fanshen-oa --lines 50

# Nginx 访问日志
tail -f /www/wwwlogs/oa.qyfanshen.com.log

# Nginx 错误日志
tail -f /www/wwwlogs/oa.qyfanshen.com.error.log
```

---

## 十二、日常运维

### 12.1 重启服务

```bash
# 重启 Node 应用
pm2 restart fanshen-oa

# 重载 Nginx（修改配置后）
nginx -s reload
```

### 12.2 更新代码

```bash
cd /www/wwwroot/oa.qyfanshen.com

# 1. 备份当前版本
tar -czf /www/backup/oa-$(date +%Y%m%d).tar.gz --exclude=node_modules --exclude=.next .

# 2. 上传新代码覆盖（通过宝塔文件管理器）

# 3. 安装新依赖（如 package.json 变更）
export PATH=/www/server/nodejs/v20.20.2/bin:$PATH
npm install --omit=optional

# 4. 重新构建
npm run build

# 5. 执行数据库迁移（如 init-db.js 变更）
npm run init:db

# 6. 重启应用
pm2 restart fanshen-oa
```

### 12.3 查看实时日志

```bash
pm2 logs fanshen-oa --lines 100
```

### 12.4 监控资源

```bash
pm2 monit
```

---

## 十三、常见问题排查

### Q1：访问网站显示 502 Bad Gateway

**原因**：Next.js 进程未启动或异常退出。

**排查步骤**：

```bash
# 1. 检查 PM2 进程状态
pm2 list
# 若状态为 errored/stopped，执行：
pm2 restart fanshen-oa

# 2. 查看错误日志
pm2 logs fanshen-oa --err --lines 50

# 3. 检查端口是否监听
ss -tlnp | grep 3000

# 4. 手动启动测试
cd /www/wwwroot/oa.qyfanshen.com
./start.sh
```

**常见根因**：
- `node_modules` 不存在 → 执行 `npm install`
- `.next/BUILD_ID` 不存在 → 执行 `npm run build`
- `.env.local` 缺失或配置错误
- Node.js 路径错误 → 检查 `start.sh` 中的 PATH

### Q2：访问网站显示 504 Gateway Timeout

**原因**：Nginx 反代超时，通常是 AI 接口响应慢。

**解决**：在 Nginx 配置中增大 `proxy_read_timeout`（参考第八节，建议 300s）。

### Q3：登录提示"账号或密码错误"

**排查**：

```bash
# 1. 确认管理员账号已初始化
mysql -u fanshen_oa_app -p fanshen_oa -e "SELECT id, username, role, status FROM users;"

# 2. 若无记录，重新初始化
cd /www/wwwroot/oa.qyfanshen.com
npm run init:auth

# 3. 检查 AUTH_SECRET 是否变更（变更会导致旧 session 失效，但密码不变）
```

### Q4：登录提示"尝试次数过多，请 15 分钟后再试"

**原因**：连续 5 次密码错误触发限流（基于 IP + 账号双维度）。

**解决**：
- 等待 15 分钟自动解锁
- 或重启 Node 进程清除内存限流计数：`pm2 restart fanshen-oa`

### Q5：文件上传失败

**排查**：

```bash
# 1. 检查 uploads 目录权限
ls -ld /www/wwwroot/oa.qyfanshen.com/uploads

# 2. 检查 Nginx 上传限制
# 确认配置了 client_max_body_size 50M

# 3. 检查磁盘空间
df -h
```

### Q6：数据库连接失败

**排查**：

```bash
# 1. 检查 MySQL 状态
systemctl status mysqld

# 2. 测试连接
mysql -u fanshen_oa_app -p -h 127.0.0.1 fanshen_oa

# 3. 检查 .env.local 数据库配置
cat /www/wwwroot/oa.qyfanshen.com/.env.local | grep DB_
```

### Q7：AI 助手无响应

**排查**：

```bash
# 1. 检查 API Key 配置
grep DEEPSEEK_API_KEY /www/wwwroot/oa.qyfanshen.com/.env.local

# 2. 测试 API 连通性
curl -H "Authorization: Bearer 你的Key" https://api.deepseek.com/v1/models

# 3. 查看应用日志
pm2 logs fanshen-oa --lines 50 | grep -i "deepseek\|ai"
```

### Q8：构建失败 `Module not found`

**原因**：依赖未完整安装。

**解决**：

```bash
cd /www/wwwroot/oa.qyfanshen.com
rm -rf node_modules package-lock.json
npm install --omit=optional
npm run build
```

### Q9：PM2 重启后项目丢失

**原因**：未执行 `pm2 save`。

**解决**：

```bash
pm2 save
pm2 startup
# 按提示执行返回的命令
```

### Q10：磁盘空间不足

```bash
# 清理 PM2 旧日志
pm2 flush

# 清理 npm 缓存
npm cache clean --force

# 查看大文件
du -sh /www/wwwroot/oa.qyfanshen.com/*
du -sh /www/backup/*
```

---

## 附录：快速部署脚本（一键执行）

> ⚠️ 执行前请确认已按第一、二节完成环境与数据库准备，并修改脚本中的变量。

将以下脚本保存为 `/www/deploy-oa.sh`，修改顶部变量后执行 `bash /www/deploy-oa.sh`：

```bash
#!/bin/bash
set -e

# ====== 请修改以下变量 ======
DOMAIN="oa.qyfanshen.com"
APP_DIR="/www/wwwroot/${DOMAIN}"
NODE_VERSION="v20.20.2"
DB_NAME="fanshen_oa"
DB_USER="fanshen_oa_app"
DB_PASSWORD="替换为数据库密码"
AUTH_SECRET="替换为步骤4.2生成的密钥"
ADMIN_PASSWORD="替换为步骤4.2生成的密码"
DEEPSEEK_KEY="替换为你的DeepSeek API Key"
# ============================

export PATH=/www/server/nodejs/${NODE_VERSION}/bin:$PATH

echo "[1/7] 切换到项目目录"
cd "$APP_DIR"

echo "[2/7] 生成 .env.local"
cat > .env.local <<EOF
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
APP_ENV=production
APP_DEBUG=false
APP_URL=https://${DOMAIN}
AUTH_SECRET=${AUTH_SECRET}
AUTH_ENFORCE=true
ADMIN_USERNAME=fanshen_superadmin
ADMIN_PASSWORD=${ADMIN_PASSWORD}
DEEPSEEK_API_KEY=${DEEPSEEK_KEY}
EOF
chmod 600 .env.local

echo "[3/7] 安装依赖"
npm config set registry https://registry.npmmirror.com
npm install --omit=optional

echo "[4/7] 生产构建"
npm run build

echo "[5/7] 初始化数据库"
npm run init:db
npm run init:auth
npm run init:ai

echo "[6/7] 准备上传目录"
mkdir -p uploads/expenses uploads/cache
chown -R www:www uploads

echo "[7/7] 启动应用"
chmod +x start.sh
pm2 delete fanshen-oa 2>/dev/null || true
pm2 start start.sh --name fanshen-oa
pm2 save

echo "✓ 部署完成，请配置 Nginx 反向代理与 SSL 证书"
```

---

## 附录：端口与目录速查

| 项 | 值 |
|---|---|
| 应用端口 | 3000 |
| MySQL 端口 | 3306 |
| HTTP 端口 | 80 |
| HTTPS 端口 | 443 |
| 项目根目录 | `/www/wwwroot/oa.qyfanshen.com` |
| 环境变量文件 | `.env.local` |
| 上传目录 | `uploads/` |
| 构建产物 | `.next/` |
| 启动脚本 | `start.sh` |
| PM2 进程名 | `fanshen-oa` |
| Nginx 站点日志 | `/www/wwwlogs/oa.qyfanshen.com.log` |
| Nginx 错误日志 | `/www/wwwlogs/oa.qyfanshen.com.error.log` |
| PM2 日志 | `~/.pm2/logs/fanshen-oa-out.log` |

---

**部署完成后，请立即：**

1. ✅ 删除 `LOGIN_SETUP.md` 中提到的测试账号（若误创建）
2. ✅ 修改 MySQL root 密码
3. ✅ 启用宝塔面板的 BasicAuth 二次验证
4. ✅ 配置定时备份
5. ✅ 记录所有密钥到密码管理器

如有问题，请优先查看 [常见问题排查](#十三常见问题排查) 章节。
