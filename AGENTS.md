# AGENTS.md

> AI 协作说明（参考 [x007xyz/flycut-caption](https://github.com/x007xyz/flycut-caption) 同名文件）

本文件用于约束 AI 助手（如 WorkBuddy / Claude / GPT 等）在为本仓库做改动时的行为。请所有 AI 协作工具在生成 PR / 修补代码前先通读此文件。

## 项目快照

- **名称**：梵燊集团 OA 办公自动化系统
- **类型**：Next.js 16 应用
- **技术栈**：Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · MySQL · DeepSeek AI · markmap · mammoth · pdf-parse
- **目录**：`oa.qyfanshen.com/`
- **远程仓库**：https://gitee.com/qyfanshen/oa.qyfanshen.git

## 行为准则

1. **不要泄露密钥**：`.env`、`.env.local` 包含真实凭据，AI 不得读取、复制、或输出其中内容。
2. **不要修改未提交的关键文件**：例如 `index.html`（用户活跃编辑中）、`.user.ini`、`.htaccess`，除非用户明确要求。
3. **遵循现有风格**：保持与同仓库已有 `*.php` / `*.html` / `*.ts` 一致的命名、缩进、注释风格。
4. **最小改动原则**：仅做用户要求的事情，不要顺手"重构"或"清理"。
5. **中文优先**：用户为中文使用者，回复、注释、提交信息用中文（git commit 可用中英混合）。
6. **遵循 FlyCut 风格**：README、AGENTS.md、TODO.md、docs/、screenshots/、.github/ 的结构与命名请保持与参考仓库一致。

## 常见任务

| 任务 | 路径 | 注意 |
|---|---|---|
| 修改首页内容 | `index.html` | 备份当前版本到 `*.bak.<timestamp>` |
| 新增 API | `api/`（PHP）/ `app/api/`（Next.js） | 同步更新 `docs/API.md` |
| 修改样式 | `css/` / 内联 | 保持响应式 |
| 新增文档 | `docs/` | 在 README 的"项目结构"段落同步更新 |

## 提交规范

- 中文提交信息以动词开头，如：`新增 物流线路导出` / `修复 支付回调签名校验`
- 每次提交对应一项主要变更
- 涉及安全敏感修复时，commit 信息需含 `security:` 前缀

## 安全须知

- 严禁将 `.env`、`.env.local`、数据库文件、API 密钥提交到仓库
- 严禁在公开文档中泄露服务器 IP、端口、内部域名
- 修改安全相关配置前先与用户确认
