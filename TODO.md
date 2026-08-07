# TODO

> 项目路线图与待办清单。完成一项后请将 `[ ]` 改为 `[x]`。

## 当前迭代

- [ ] 用真实截图替换 `screenshots/preview.svg` 占位图
- [ ] 校对 README / AGENTS / docs 三份文档与代码实际状态一致
- [ ] CI 流水线跑通（`.github/workflows/ci.yml`）

## Next.js 站通用
- [ ] 引入 E2E 测试（Playwright）
- [ ] 增加 Storybook 用于组件文档
- [ ] 拆分 RSC / Server Actions 与 Client Components
- [ ] 接入 Sentry / OpenTelemetry 监控
- [ ] 配置 `next.config.ts` 国际化路由（如需多语言）
- [ ] 增加 rate-limit / bot 防护中间件

## 安全 / 合规

- [ ] 复查 `.gitignore` 是否覆盖 `*.bak.*`、`node_modules/`、`.next/`、`.env*`
- [ ] 复查 Nginx / Apache 配置文件中的安全头（CSP / X-Frame-Options / Referrer-Policy）
- [ ] 私钥、数据库连接串不出现在任何提交文件中

## 后续迭代

- [ ] 增加多语言（英文 / 繁体）支持
- [ ] 接入 Lighthouse / PageSpeed 自动监测
- [ ] 增加 LICENSE 之外的 NOTICE / 第三方依赖声明
