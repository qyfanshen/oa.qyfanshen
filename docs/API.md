# API Reference

> 梵燊集团 OA 办公自动化系统 的接口文档。模块：app/api/auth, app/api/documents, app/api/ai, app/api/users

## 通用约定

- 基础路径：`/api/`
- 请求/响应：JSON
- 鉴权：除登录接口外，所有接口需要带 `Authorization: Bearer <token>` 或 Cookie 会话
- 限流：默认每 IP 每分钟 60 次（可由 `api/rate_limit.php` 或中间件调整）
- 错误格式：
  ```json
  { "code": 400, "message": "Invalid parameter", "data": null }
  ```


## Next.js 路由

```
POST  /api/auth/login
POST  /api/auth/logout
GET   /api/auth/me
GET   /api/documents
POST  /api/documents           # 上传 PDF/Word/Markdown
GET   /api/ai/summary          # 调用 AI 摘要
POST  /api/ai/qa               # 文档问答
GET   /api/users               # 用户管理（管理员）
```

> 完整列表以 `app/api/**/route.ts` 实际导出为准。
