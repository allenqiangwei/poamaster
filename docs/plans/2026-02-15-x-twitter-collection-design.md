# X/Twitter Collection Design (Phase 2)

## Goal

为 sentiment-collector 服务增加 X/Twitter 推文采集能力，按游戏关键词搜索推文，存入 SentimentMention 表，复用现有情感分析和仪表盘展示。

## Architecture

- 新增 `collectors/twitter.ts`，使用 `@the-convocation/twitter-scraper` npm 包
- X 账号凭据存入 POA Master 配置（加密），通过 Prisma 读取
- 每 4 小时 cron 采集一次，搜索每个游戏的 `xKeywords`
- 推文存入 `SentimentMention` (platform='X')，本地 AFINN 情感分析
- 仪表盘增加 X 渠道的最后采集时间、下次倒计时、来源筛选

## Config Keys

| Key | 加密 | 说明 |
|---|---|---|
| `x.username` | 否 | X 账号用户名 |
| `x.password` | 是 | X 账号密码 |
| `x.email` | 是 | X 账号邮箱 |

## Collection Flow

1. 从 DB 读取 X 凭据，登录（缓存 session）
2. 查询 `MonitoredGame` where `isActive=true` and `xKeywords` 不为空
3. 对每个游戏的每个关键词：`searchTweets(keyword, limit=50)`
4. 去重（`@@unique([platform, externalId])`），本地情感分析
5. 存入 `SentimentMention`

## Schedule

- Cron: `0 */4 * * *`（每 4 小时）
- 与现有 review 采集（每日 06:00）互不干扰

## UI Changes

- overview API: `lastCollected` 增加 `X` 平台
- sentiment page: 采集时间 + 倒计时 + ToggleButton 增加 X
- trends API: 支持 X 平台筛选

## Not In Scope

- Facebook 采集（反爬严格，后续单独评估）
- 实时监控（4h 间隔足够）
- 数据模型变更（SentimentMention + xKeywords 已存在）
