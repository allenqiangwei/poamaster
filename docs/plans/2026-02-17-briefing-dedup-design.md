# 洞察简报去重系统设计

## 问题

同一话题每天生成的卡片内容大同小异。根因：
1. Serper 搜索结果 7 天窗口内同一篇文章连续多天出现
2. LLM 没有"昨天已分析过这个事件"的记忆
3. 不同 keyword combo 搜到同一批文章

## 方案：URL + 摘要双层去重

### Layer 1 — 搜索结果 URL 去重

在 `researcher.ts` 的 `searchTopic()` 中：
- 搜索完成后，查询近 7 天所有 InsightCard 的 `sources` 字段
- 提取所有已引用 URL
- 从搜索结果中排除这些 URL
- 如果过滤后搜索结果不足 3 条，放宽到只排除近 3 天的 URL

### Layer 2 — LLM 摘要增量判断

在 `generate/route.ts` 的卡片生成循环中：
- 卡片生成后，查询同话题近 3 天的卡片 title+summary
- 注入到分析 prompt 中作为"已覆盖事件"列表
- 让 LLM 在分析时自主聚焦增量信息
- 如果 LLM 返回的 title 与历史卡片完全一致或分析判定为"无增量"，跳过该卡片

### Layer 3 — Prompt 增强

在 `researcher.ts` 的 `analyzeTopicWithContext()` prompt 中：
- 注入"## 近期已覆盖事件"段落，列出近 3 天同话题卡片的 title
- 明确指示"不要重复分析以下已覆盖的事件，聚焦新发现"

## 文件变更

| 文件 | 变更 |
|------|------|
| `lib/insights/researcher.ts` | `searchTopic()` 增加 URL 排除逻辑；`analyzeTopicWithContext()` prompt 注入历史事件 |
| `app/api/insights/briefing/generate/route.ts` | 卡片生成循环增加增量判断 |

## 不需要的

- 不需要新 Prisma 模型
- 不需要 embedding/向量数据库
- 不需要修改前端
