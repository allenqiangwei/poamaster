# 竞品分析可视化系统设计

## 目标

将竞品监控从纯管理（CRUD）升级为完整的可视化分析系统，支持评分趋势、情感分析、多竞品对比和新闻动态流，帮助团队快速洞察竞品动态并做出决策。

## 技术栈

- **图表**: Recharts (已安装)
- **UI**: MUI + designTokens (已有)
- **数据**: Prisma (CompetitorAppSnapshot, CompetitorReview, CompetitorWebChange, CompetitorNews, CompetitorAlert)
- **路由**: Next.js App Router

## 页面结构

```
/insights/competitors          → 总览 Dashboard (改造现有页面)
/insights/competitors/[id]     → 单竞品详情 (新页面)
/insights/competitors/compare  → 多竞品对比 (新页面)
/insights/competitors/news     → 新闻与动态流 (新页面)
```

---

## 页面 1: 竞品总览 Dashboard

**路由**: `/insights/competitors` (改造现有管理页面)

### 顶部 KPI 卡片行

4 张统计卡片横排：

| 卡片 | 数据源 | 展示 |
|------|--------|------|
| 监控中竞品数 | `Competitor.count(enabled)` | 数字 |
| 本周新评论数 | `CompetitorReview.count(7天)` | 数字 + 较上周变化 |
| 全部竞品平均评分 | `CompetitorAppSnapshot.avg(rating)` 最新 | 数字 (1位小数) + 趋势箭头 |
| 未处理告警数 | `CompetitorAlert.count(!acknowledged)` | 数字 + 严重等级 Chip |

### 评分趋势图

- **组件**: Recharts `LineChart` + `ResponsiveContainer`
- **X 轴**: 日期 (过去 30 天)
- **Y 轴**: 评分 (1.0 - 5.0)
- **数据**: 每个竞品一条折线，颜色自动分配
- **交互**: 图例切换显示/隐藏，Tooltip 显示各竞品当天评分
- **数据源**: `CompetitorAppSnapshot` 按 `competitorId` + `createdAt` 聚合

### 竞品卡片网格

改造现有 Grid 卡片，增强信息密度：

每张卡片：
- 竞品名称 (加粗) + 公司名 (副标题)
- **当前评分** (大号字体，如 4.2) + 趋势箭头 (较 7 天前)
- 近 7 天评论数 + 好评率百分比
- 平台 Chip (App Store / Google Play)
- 未读告警徽标 (Badge)
- 点击整张卡片 → 跳转详情页 `/insights/competitors/[id]`
- 管理操作 (编辑/删除/开关) 收到右上角 IconButton → Menu

### 底部告警面板

- 最近 5 条未处理告警
- 每条显示：严重等级 Chip (HIGH=红, MEDIUM=橙, LOW=灰)、标题、竞品名、时间
- "标记已处理" 按钮
- "查看全部" 链接

### 顶部导航入口

在标题栏添加 Tab 或按钮组，导航到对比页和新闻页：
- [总览] [对比] [新闻] [管理]
- 管理 Tab 包含添加/编辑/删除等 CRUD 操作

---

## 页面 2: 单竞品详情页

**路由**: `/insights/competitors/[id]`

### 页面头部

- 返回按钮 → 总览
- 竞品名称 + 公司名
- 平台 Chip (App Store / Google Play)
- 当前评分 (大号) + 近 7 天趋势 (↑+0.2 绿色 / ↓-0.1 红色)
- 按钮: 编辑、立即获取

### Tab 1: 评分与情感

**评分趋势折线图**:
- Recharts `LineChart`
- 时间范围切换: 7天 / 30天 / 90天 (ToggleButtonGroup)
- Y 轴: 评分 1.0-5.0
- 版本发布标记 (ReferenceLine 或 dot 标注)

**情感分布饼图**:
- Recharts `PieChart`
- 三段: Positive (绿) / Neutral (灰) / Negative (红)
- 中心显示总评论数
- 数据源: `CompetitorReview.sentiment` 聚合

**评论量柱状图**:
- Recharts `BarChart`
- 按日/按周分组
- 堆叠: 好评 (4-5星, 绿) / 中评 (3星, 灰) / 差评 (1-2星, 红)

**关键标签排行**:
- 横向 BarChart，Top 10 高频标签
- 数据源: `CompetitorReview.tags` JSON 数组聚合计数
- 如: 闪退 (42), 付费不合理 (38), 画面卡顿 (25)

### Tab 2: 评论列表

**筛选栏**:
- 平台: All / App Store / Google Play
- 评分: 全部 / 1-2星 / 3星 / 4-5星
- 情感: 全部 / Positive / Neutral / Negative
- 时间范围: 7天 / 30天 / 90天

**表格**:
| 列 | 说明 |
|----|------|
| 评分 | 星级图标 (1-5) |
| 标题 | 评论标题 (可为空) |
| 内容 | 评论正文，超长截断 |
| 情感 | Chip: 正面(绿)/中性(灰)/负面(红) |
| 标签 | 多个小 Chip |
| 日期 | 相对时间 |

- 分页: 每页 20 条
- 排序: 默认按日期倒序，可按评分排序

### Tab 3: 版本更新时间线

- MUI `Timeline` 组件 (竖向)
- 每个节点:
  - 版本号 (如 v2.3.1)
  - 发布日期
  - 更新日志摘要 (releaseNotes 截取前 200 字)
  - 评分变化标注: 版本发布后 7 天 vs 发布前 7 天的平均评分差
- 数据源: `CompetitorAppSnapshot` 按 `version` 去重，取 `releaseNotes`

### Tab 4: 网页变更记录

- 时间线列表
- 每条记录:
  - 变更类型 Chip: major_update (红) / content (蓝) / baseline (灰)
  - URL 标签
  - 摘要文本
  - 变化百分比
  - 检测时间
- 数据源: `CompetitorWebChange` 按时间倒序

---

## 页面 3: 多竞品对比

**路由**: `/insights/competitors/compare`

### 竞品选择器

- 多选 Autocomplete (MUI)
- 选择 2-5 个竞品
- 时间范围: 7天 / 30天 / 90天 (ToggleButtonGroup)
- URL 参数持久化 (`?ids=xxx,yyy&range=30`)

### 对比维度 1: 评分趋势对比

- Recharts `LineChart`
- 每个竞品一条折线
- 颜色自动分配 (预定义调色板)
- Tooltip 显示所有竞品当天评分

### 对比维度 2: 情感分布对比

- Recharts `BarChart` (分组)
- X 轴: 竞品名称
- Y 轴: 百分比
- 三组柱: Positive / Neutral / Negative
- 或: 堆叠百分比柱状图 (100% stacked bar)

### 对比维度 3: 评论量对比

- Recharts `BarChart` (分组)
- X 轴: 竞品名称
- Y 轴: 评论数
- 分组: 好评 / 中评 / 差评

### 对比维度 4: 关键问题热力图

- HTML Table + 动态背景色
- 行 = 高频问题标签 (从所有选中竞品的 tags 取 Top 15)
- 列 = 各竞品名称
- 单元格 = 出现次数
- 配色: 0→白色, max→深红色 (线性插值)
- 可快速看出哪个竞品在哪些问题上最突出

---

## 页面 4: 新闻与动态流

**路由**: `/insights/competitors/news`

### 筛选栏

- 竞品筛选: 全部 / 单个竞品 (Select)
- 信息类型: 全部 / 新闻搜索 / 网页变更 (ToggleButtonGroup)
- 时间范围: 7天 / 30天 / 全部

### 信息流 (按时间倒序)

每条卡片:
- **来源 Chip**: Google Search (蓝) / 官网变更 (橙) / 网页变更 (灰)
- 竞品名称 Chip
- 标题 (新闻类可点击，新窗口打开)
- 摘要文本 (最多 200 字)
- 发布/检测时间 (相对时间)
- 高影响标记: 融资/收购/裁员等关键词匹配时显示红色左边框

### 右侧统计面板

**近 7 天新闻分布**:
- Recharts `BarChart`
- X 轴: 竞品名称
- Y 轴: 新闻条数

**高影响事件**:
- 最近的 HIGH 级别告警列表
- 时间 + 标题 + 竞品名

---

## API 端点设计

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/competitors/dashboard` | GET | 总览页所有数据 (KPI + 评分趋势 + 卡片数据 + 告警) |
| `/api/competitors/[id]/detail` | GET | 单竞品详情 (评分趋势 + 情感分布 + 标签聚合) |
| `/api/competitors/[id]/reviews` | GET | 评论列表 (分页 + 筛选) |
| `/api/competitors/[id]/versions` | GET | 版本更新时间线 |
| `/api/competitors/[id]/webchanges` | GET | 网页变更记录 |
| `/api/competitors/compare` | GET | 多竞品对比数据 |
| `/api/competitors/news` | GET | 新闻与动态流 (分页 + 筛选) |
| `/api/competitors/alerts` | GET/PATCH | 告警列表 + 标记已处理 |

所有端点支持 `range` 查询参数 (7/30/90 天)。

---

## 文件结构

```
app/(dashboard)/insights/competitors/
  page.tsx                    — 总览 Dashboard (改造)
  [id]/
    page.tsx                  — 单竞品详情
  compare/
    page.tsx                  — 多竞品对比
  news/
    page.tsx                  — 新闻与动态流

app/api/competitors/
  dashboard/route.ts          — 总览数据 API
  [id]/detail/route.ts        — 单竞品详情数据
  [id]/reviews/route.ts       — 评论列表
  [id]/versions/route.ts      — 版本时间线
  [id]/webchanges/route.ts    — 网页变更
  compare/route.ts            — 对比数据
  news/route.ts               — 新闻流
  alerts/route.ts             — 告警管理
```

## 设计参考

- [Sensor Tower App Performance Insights](https://sensortower.com/product/mobile-app/app-performance-insights)
- [PeerPanda Competitor Dashboard Guide](https://getpeerpanda.com/competitor-monitoring/competitor-dashboard/)
- [Valona Intelligence CI Dashboard](https://valonaintelligence.com/market-intelligence-software/competitive-intelligence-dashboard)
- [BI Dashboard Design Best Practices 2025](https://julius.ai/articles/business-intelligence-dashboard-design-best-practices)
