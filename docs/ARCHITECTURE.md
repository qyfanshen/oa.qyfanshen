# Architecture

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
