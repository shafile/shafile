<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Shafile 项目约定

## 常用命令

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm i18n:check
```

提交前至少运行 `pnpm lint && pnpm typecheck && pnpm test`。涉及界面或加密流程时再运行 `pnpm test:e2e`（Playwright 首次需 `pnpm exec playwright install chromium`）。

## 架构边界

- `src/lib/client/` 只能使用浏览器 API；不要在这里引入 `node:*` 或 `Buffer`。
- `src/lib/server/` 只能被 Route Handler、服务端组件或 instrumentation 引入。
- API 返回稳定错误码（`src/lib/shared/errors.ts`），由客户端翻译；服务端不要返回本地化句子。
- 任何用户可见文案必须写入 `messages/*.json` 三份词条，并运行 `pnpm i18n:check`。
- locale 不进入 URL；切换语言用 Cookie + `router.refresh()`，分享链接中的 `#k` 不能被改动。
- 加密格式或 AAD 发生变化时，提升版本标识并补充单元测试；不要静默修改现有密文格式。
- 服务器不得记录请求体、密码、内容密钥或文件名。密文目录为 `data/blobs/`，运行时数据不提交。

## 样式

- 视觉令牌在 `src/app/globals.css`：使用 `bg-surface`、`text-muted`、`border-line` 等语义类，不要硬编码颜色。
- 视觉遵循 macOS 式克制的阴影与渐变、细边框和系统字体；配色使用陶土橙 + 蜂蜜金，保留 Slack 的友好语气，不复制 Slack 布局。
- 新组件优先复用 `src/components/ui/`；中英文和日文都要检查换行与溢出。
- 使用逻辑 CSS 属性（`ms-*` / `me-*` / `text-start`），为 RTL 预留空间。

## Git

- 提交信息使用英文，遵循 `docs/git-flow.md` 的 Conventional Commits 规范。
- 未明确要求时不要推送、合并、改写历史或发布。
