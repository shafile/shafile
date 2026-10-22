# Git Flow

Shafile 使用轻量 Git Flow。所有提交信息必须使用英文。

## 分支模型

| 分支 | 用途 |
| --- | --- |
| `main` | 生产分支，只接受经过验证的发布 |
| `develop` | 集成分支；如果仓库暂未启用，功能分支直接从 `main` 创建 |
| `feature/<scope>` | 新功能 |
| `release/<version>` | 发布准备与缺陷修复 |
| `hotfix/<version>` | 生产环境紧急修复 |

分支名使用英文小写 kebab-case，例如 `feature/password-share`、`release/0.2.0`。

## 提交信息

所有 commit message 使用英文，遵循 Conventional Commits：

```
<type>(<scope>): <subject>
```

- `type`：`feat`、`fix`、`docs`、`style`、`refactor`、`test`、`build`、`ci`、`chore`、`perf`、`revert`
- `scope` 可选，使用小写英文，例如 `upload`、`i18n`、`docker`
- `subject` 使用祈使语气、小写开头、不加句号，建议不超过 72 个字符
- 正文使用英文，解释“为什么”，每行建议不超过 100 个字符
- 破坏性变更使用 `BREAKING CHANGE:` 页脚说明

示例：

```
feat: initialize Shafile end-to-end encrypted sharing
fix(upload): resume interrupted chunk uploads
docs: add Docker deployment guide
ci: cache pnpm dependencies
feat(crypto)!: bump file format version

BREAKING CHANGE: existing ciphertext must be re-encrypted.
```

## 工作流

1. 从 `develop` 创建短生命周期的功能分支；紧急修复从 `main` 创建 `hotfix/<version>`。
2. 使用英文提交信息，保持每次提交聚焦。
3. 向 `develop` 提交 Pull Request；PR 标题和 squash 后的提交标题也使用英文 Conventional Commits。
4. CI 必须通过：lint、typecheck、单元测试、生产构建、Playwright E2E 和 Docker 镜像构建。
5. 发布时从 `develop` 创建 `release/<version>`，通过 PR 合并到 `main` 后打 SemVer 标签，例如 `v0.2.0`。
6. 紧急修复完成后通过 PR 同时合回 `main` 与 `develop`。

## 自动 PR

- 推送 `feature/**` 分支会触发 `.github/workflows/auto-pr.yml`
- 工作流使用仓库的 `GITHUB_TOKEN` 向 `develop` 自动创建 Pull Request；已有打开的 PR 时跳过
- PR 标题和正文来自该分支最早的功能提交，保持英文
- `GITHUB_TOKEN` 创建的 PR 不会触发 `pull_request` 工作流，因此 CI 同时监听 `feature/**` 的 push

## 约束

- 不直接向 `main` 或 `develop` 推送，首个初始化提交除外。
- `main` 上 `4663e40` 及之前的历史是流程修复前的例外；此后所有变更必须经过 PR。
- 不提交 `data/`、密文、SQLite 文件、密钥、`.env` 或测试产物。
- 未明确要求时，不推送、不改写历史、不创建 PR 或发布。

## 分支保护

在 GitHub **Settings → Rules / Branches** 中至少配置：

- `main`：Require a pull request before merging；required checks 包含 `Lint, test, build, E2E`、`Cloudflare Worker build and E2E`、`Docker image build`；Block force pushes。
- `develop`：Require a pull request before merging；required checks 包含 `Lint, test, build, E2E` 和 `Cloudflare Worker build and E2E`。
- 禁止管理员绕过上述规则，或至少保留审计记录。

如果使用自动 PR，请启用 **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests**。
