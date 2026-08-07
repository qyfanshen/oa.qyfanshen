# 登录系统部署说明

## 1. 配置环境变量

在项目根目录复制 `.env.example` 为 `.env.local`，填入宝塔中创建的数据库信息：

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=fanshen_oa_app
DB_PASSWORD=你的数据库密码
DB_NAME=fanshen_oa
AUTH_SECRET=至少32位的随机字符串
ADMIN_USERNAME=admin
ADMIN_PASSWORD=管理员初始强密码（至少12位）
```

网站和 MySQL 在同一台服务器时，`DB_HOST` 必须保持为 `127.0.0.1`。`.env.local` 含有密码，不能上传到 Git 仓库或发送给他人。

## 2. 初始化管理员

在宝塔「终端」或 Node 项目终端中，进入项目目录并执行：

```bash
npm run init:auth
```

该命令会在 `fanshen_oa` 数据库创建 `users` 表，并创建或重置 `ADMIN_USERNAME` 对应的管理员账号。

## 3. 构建并运行

```bash
npm run build
npm run start
```

宝塔 Node 项目管理器中，启动命令使用 `npm run start`。首次构建前务必已存在 `.env.local`。

## 安全说明

- 初始管理员登录后，应在后续的员工管理功能中新增普通账号；不要共用管理员账号。
- 登录失败同一 IP 15 分钟内最多 5 次。
- 会话采用 HttpOnly、SameSite Cookie，默认 8 小时失效。
- 生产环境必须使用 HTTPS，Cookie 会自动启用 `Secure` 属性。
