# Fanshen OA

> AI-Powered Office Automation for Fanshen Group

> 🚀 **[Live Demo](https://oa.qyfanshen.com)** · 📚 **[Docs](docs/)** · 📋 **[Quick Start](docs/QUICKSTART.md)** · 🐛 **[Report Bug](https://github.com/qyfanshen/oa.qyfanshen/issues)** · ⭐ **[Star](https://github.com/qyfanshen/oa.qyfanshen)**

![preview](screenshots/preview.png)
<p align="center">
  <a href="https://github.com/qyfanshen/oa.qyfanshen"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <a href="https://github.com/qyfanshen/oa.qyfanshen/actions"><img src="https://img.shields.io/github/actions/workflow/status/qyfanshen/oa.qyfanshen/ci.yml?branch=master&label=CI" alt="CI"></a>
  <a href="https://img.shields.io/github/languages/code-size/qyfanshen/oa.qyfanshen"><img src="https://img.shields.io/github/languages/code-size/qyfanshen/oa.qyfanshen" alt="Code size"></a>
  <a href="https://github.com/qyfanshen/oa.qyfanshen/issues"><img src="https://img.shields.io/github/issues/qyfanshen/oa.qyfanshen" alt="Issues"></a>
  <a href="https://github.com/qyfanshen/oa.qyfanshen/stargazers"><img src="https://img.shields.io/github/stars/qyfanshen/oa.qyfanshen?style=social" alt="Stars"></a>
</p>

---

**Fanshen OA** is an AI-powered office automation system (Next.js 16) — document analysis with DeepSeek, attendance, approvals and announcements in one app.

[English](README.md) | [中文](README.zh.md)

## Key Scenarios

- **📄 AI document analysis** — Upload PDF/Word/Markdown — get summary, mind map and Q&A via DeepSeek.
- **👤 Employee self-service** — Attendance, approvals, announcements and chat in one app.
- **🔐 Secure auth** — JWT-protected routes with MySQL persistence and role-based access.

## Features

### Core Features
- AI document analysis: summary, mind map (markmap), question answering via DeepSeek
- Multi-format document parsing: PDF (pdf-parse), Word (mammoth), Markdown, plain text
- User & auth: bcrypt + JWT (jose) with middleware route protection
- Persistent storage on MySQL with init scripts (init:auth / init:db / init:ai)
- Modern UI built with Tailwind 4 and componentized architecture
- Production-ready: lint config, type-check scripts, env.example-driven config

### Technical Features
- Modern web stack: Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · MySQL · DeepSeek AI · markmap · mammoth · pdf-parse
- Privacy-first: HTTPS enforced, security headers, sensitive-file isolation
- SEO-ready: `sitemap.xml`, `robots.txt`, semantic markup
- License: MIT

## Screenshots

Real screenshots captured after signing in:

### Workbench (after sign-in)

![Workbench](screenshots/preview.png)

---

## Quick Start

> **Requirements**: Node.js 20.9+ (22 LTS recommended), npm 10+
>
> **Required config**: run `cp .env.example .env.local`, then fill in `DEEPSEEK_API_KEY`, `DB_PASSWORD`, etc.
>
> **Windows note**: if `git clone` fails with `unable to checkout working tree`, run `git config --global core.autocrlf false` first.

Three commands to get started:

```bash
git clone https://gitee.com/qyfanshen/oa.qyfanshen.git
cd oa.qyfanshen.com
npm install && npm run dev   # open http://localhost:3000
```

> Full steps (Nginx, env vars, production) in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
## Troubleshooting

- **`git clone` fails with `unable to checkout working tree`**: Windows line-ending issue — run `git config --global core.autocrlf false` and clone again.
- **`npm install` fails with ENOENT**: make sure you are in the project root (where `package.json` lives).
- **Node version too old**: Next.js 16 requires Node 20.9+; use `nvm use 22` or upgrade Node.
- **`DEEPSEEK_API_KEY` not set**: copy `.env.example` to `.env.local` and fill in a real key, otherwise AI features won't work.
- **Database connection fails**: make sure MySQL is running and `DB_NAME/DB_USER/DB_PASSWORD` match `.env.local`, then run `npm run init:db` first.

## Usage Guide

1. Configure your environment: `cp .env.example .env.local` and fill in database & AI keys.
2. Run database init scripts if needed (see `package.json` scripts: init:auth / init:db / init:ai).
3. Start the app with `npm run dev` (development) or `npm run build && npm start` (production).
4. Visit http://localhost:3000 and login with your admin account.

## Project Structure

```
oa.qyfanshen.com/
├── README.md            # This file (English)
├── README.zh.md         # Chinese README
├── AGENTS.md            # AI agent collaboration notes
├── TODO.md              # Roadmap & TODOs
├── CHANGELOG.md         # Version history
├── CONTRIBUTING.md      # Contribution guide
├── LICENSE              # MIT License
├── src/app/            # Next.js App Router (routes)
├── PRIVACY.md           # Privacy policy
├── screenshots/         # Visual assets
│   ├── README.md
│   └── preview.png
├── docs/                # Additional documentation
│   ├── QUICKSTART.md
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   ├── API.md
└── .github/             # Issue templates & CI workflows
    ├── ISSUE_TEMPLATE/
    ├── workflows/ci.yml
    └── PULL_REQUEST_TEMPLATE.md
```

## Architecture

## 概述

- **项目**：梵燊集团 OA 办公自动化系统
- **类型**：Next.js 16 应用
- **技术栈**：Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · MySQL · DeepSeek AI · markmap · mammoth · pdf-parse

## 模块划分




- **App Router**：`app/` 下采用 Next.js App Router（Server + Client Components）。
- **API Routes**：`app/api/*` 提供 RESTful 接口。
- **AI 能力**：`ai/` 模块封装 DeepSeek 等 LLM 调用，输出摘要、思维导图、问答。


## 数据流

```
[Browser]
   │
   ├─── 静态资源（Nginx / CDN）
   │

   ├─── /api/* (Next.js) ──► [MySQL] + [DeepSeek AI]

   │
   └─── /admin/*（如适用）
```

## 安全设计

- HTTPS 强制（301 跳转）
- 安全响应头：CSP / X-Frame-Options / Referrer-Policy / Permissions-Policy
- 敏感文件（`.env`、`*.bak.*`、`storage/`、`.user.ini`）通过 `.gitignore` + Nginx deny 双重保护
- 接口限流（PHP 站 `api/rate_limit.php`）
- CSRF token 校验（PHP 站 `includes/csrf.php`）

## Development

- Linting / formatting per project conventions
- Run `git status` before committing
- Follow the security guidelines in `.env.example`

## API Reference

See [`docs/API.md`](docs/API.md) for the full API surface. Current modules include:

- `app/api/auth`
- `app/api/documents`
- `app/api/ai`
- `app/api/users`

## Deployment

## 生产部署

### 1. 构建生产包

```bash
cd /var/www/oa.qyfanshen.com
npm install
npm run build
```

### 2. Nginx 反向代理（推荐）

```nginx
server {
    listen 80;
    server_name oa.qyfanshen.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name oa.qyfanshen.com;

    ssl_certificate     /etc/nginx/ssl/fanshen-oa.crt;
    ssl_certificate_key /etc/nginx/ssl/fanshen-oa.key;

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;

    # 反向代理到 Next.js（默认 3000 端口）
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 静态资源缓存
    location ~* \.(css|js|jpg|jpeg|png|gif|svg|woff2?)$ {
        expires 7d;
        add_header Cache-Control "public, max-age=604800, immutable";
    }

    # 禁止访问敏感文件
    location ~ /\.(env|user\.ini|htaccess|bak\.|composer\.json|composer\.lock|package\.json|\.git) {
        deny all;
        return 404;
    }
}
```

### 3. 进程管理

使用宝塔「Node 项目管理器」或 PM2 启动：

```bash
# PM2 方式
cd /var/www/oa.qyfanshen.com
npm install pm2 -g
pm2 start npm --name "oa" -- start
pm2 save
pm2 startup
```

### 4. 部署后检查清单

- [ ] HTTPS 已生效（浏览器锁图标）
- [ ] `https://oa.qyfanshen.com/.env` 返回 404
- [ ] 安全响应头可在 https://securityheaders.com 验证为 A 或 A+
- [ ] sitemap.xml 可访问
- [ ] robots.txt 可访问
- [ ] 隐私页可访问（Next.js 路由）

## Code of Conduct

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) — be kind and respectful.

## Security

Spotted a security issue? 💖 Thank you for disclosing it responsibly!

Before sending the report, please take a moment to skim the [Security Policy](SECURITY.md) — it helps us respond faster and ensures nothing slips through.

## Contributing

Contributions are warmly welcomed! 💖

If you'd like to help out, please read our [CONTRIBUTING.md](CONTRIBUTING.md) and use the [issue templates](.github/ISSUE_TEMPLATE/) along with the [PR template](.github/PULL_REQUEST_TEMPLATE.md) — it makes collaboration much smoother for everyone. 🙏

## License

This project is licensed under the **MIT License**.

**You are free to:**
- ✅ Use commercially
- ✅ Modify
- ✅ Distribute
- ✅ Sublicense
- ✅ Use privately

**Under the following conditions:**
- 📄 Include the original copyright and license notice in any copy of the software

**Full text:** See the [LICENSE](LICENSE) file for the complete license.

## Acknowledgments

- Inspired by [x007xyz/flycut-caption](https://github.com/x007xyz/flycut-caption) repo style
- Built by the Fanshen Group engineering team

## Support

- Issues: please use the in-repo issue templates
- Domain: https://oa.qyfanshen.com

## Contact Us

Scan the QR code below to add our enterprise WeChat for technical support and business inquiries:

![WeChat QR Code](screenshots/wechat-qrcode.png)

Or reach us at:
- Website: <https://qyfanshen.com>
- Issues: please use the in-repo issue templates

---

**Copyright © 2026 [qyfanshen](https://github.com/qyfanshen). All rights reserved.**

Licensed under the [MIT License](LICENSE).
