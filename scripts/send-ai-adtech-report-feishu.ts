/**
 * 生成「AI投放在游戏行业的应用」市场调研报告并通过飞书发送
 * 运行方式：npx tsx scripts/send-ai-adtech-report-feishu.ts
 */

import puppeteer from 'puppeteer';
import { PrismaClient } from '@prisma/client';
import { createDecipheriv } from 'crypto';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// ─── 解密 & 配置 ──────────────────────────────────────────────────────────────

function decrypt(val: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return val;
  const parts = val.split(':');
  if (parts.length !== 3) return val;
  const key = Buffer.from(secret.padEnd(32, '0').slice(0, 32));
  const [ivHex, tagHex, enc] = parts;
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(enc, 'hex', 'utf8') + decipher.final('utf8');
}

async function getConfig(key: string): Promise<string> {
  const row = await prisma.config.findUnique({ where: { key } });
  return row?.value ? decrypt(row.value) : '';
}

// ─── 飞书 API ─────────────────────────────────────────────────────────────────

async function getTenantToken(): Promise<string> {
  const [appId, appSecret] = await Promise.all([getConfig('feishu.appId'), getConfig('feishu.appSecret')]);
  if (!appId || !appSecret) throw new Error('飞书 App ID/Secret 未配置');
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const d: any = await res.json();
  if (d.code !== 0) throw new Error(`获取Token失败: ${d.msg}`);
  return d.tenant_access_token;
}

async function uploadPDF(buf: Buffer, name: string, token: string): Promise<string> {
  const fd = new FormData();
  fd.append('file_type', 'pdf');
  fd.append('file_name', name);
  fd.append('file', new Blob([buf], { type: 'application/pdf' }), name);
  const res = await fetch('https://open.feishu.cn/open-apis/im/v1/files', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
  });
  const d: any = await res.json();
  if (d.code !== 0) throw new Error(`上传失败: ${d.msg}`);
  return d.data.file_key;
}

async function sendFileMsg(chatId: string, fileKey: string, token: string): Promise<void> {
  const res = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ receive_id: chatId, msg_type: 'file', content: JSON.stringify({ file_key: fileKey }) }),
  });
  const d: any = await res.json();
  if (d.code !== 0) throw new Error(`发送失败: ${d.msg}`);
}

// ─── 报告 HTML ────────────────────────────────────────────────────────────────

function buildHTML(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>AI投放在游戏行业的应用：市场调研报告 2026</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;font-size:13px;line-height:1.75;color:#1a1a2e;background:#fff;padding:48px 56px}

/* ── 封面 ── */
.cover{text-align:center;padding:64px 0 52px;border-bottom:3px solid #7c3aed;margin-bottom:44px}
.cover .badge{display:inline-block;background:#7c3aed;color:#fff;font-size:11px;font-weight:700;letter-spacing:1.5px;padding:4px 16px;border-radius:20px;margin-bottom:20px}
.cover h1{font-size:28px;font-weight:800;line-height:1.35;color:#0f0a2e;margin-bottom:14px}
.cover .sub{font-size:14px;color:#555;margin-bottom:28px;line-height:1.8}
.cover .meta{font-size:12px;color:#999}

/* ── 执行摘要 ── */
.exec{background:linear-gradient(135deg,#f5f3ff,#ede9fe);border-left:4px solid #7c3aed;border-radius:0 10px 10px 0;padding:22px 28px;margin-bottom:40px}
.exec h2{font-size:13px;font-weight:800;color:#7c3aed;margin-bottom:10px;letter-spacing:.5px}
.exec p{color:#333;font-size:13px;line-height:1.85}

/* ── 章节标题 ── */
h2.sec{font-size:18px;font-weight:800;color:#0f0a2e;padding-bottom:9px;border-bottom:2px solid #ede9fe;margin:40px 0 18px}
h2.sec .n{display:inline-block;width:28px;height:28px;background:#7c3aed;color:#fff;border-radius:50%;font-size:13px;line-height:28px;text-align:center;margin-right:10px;vertical-align:middle}
h3{font-size:14px;font-weight:700;color:#3b0764;margin:22px 0 10px}
p{margin-bottom:11px;color:#333}
ul,ol{padding-left:22px;margin-bottom:13px}
li{margin-bottom:7px;color:#333}

/* ── 数据卡 ── */
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:18px 0}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin:18px 0}
.card{background:#faf5ff;border:1px solid #ddd6fe;border-radius:10px;padding:18px}
.card .big{font-size:30px;font-weight:800;color:#7c3aed;line-height:1.1}
.card .label{font-size:11px;color:#555;margin-top:5px;line-height:1.5}
.card .src{font-size:10px;color:#aaa;margin-top:4px}

/* ── 高亮框 ── */
.hl{background:#fef9c3;border:1px solid #fde68a;border-radius:9px;padding:16px 20px;margin:16px 0}
.hl .tag{font-size:11px;font-weight:800;color:#92400e;letter-spacing:1px;margin-bottom:7px}
.hl p{color:#444;margin:0}

.info{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:9px;padding:16px 20px;margin:16px 0}
.info .tag{font-size:11px;font-weight:800;color:#166534;letter-spacing:1px;margin-bottom:7px}
.info p{color:#333;margin:0}

.warn{background:#fff7ed;border:1px solid #fed7aa;border-radius:9px;padding:16px 20px;margin:16px 0}
.warn .tag{font-size:11px;font-weight:800;color:#9a3412;letter-spacing:1px;margin-bottom:7px}
.warn p{color:#444;margin:0}

/* ── 表格 ── */
table{width:100%;border-collapse:collapse;margin:16px 0;font-size:12px}
th{background:#7c3aed;color:#fff;padding:10px 14px;text-align:left;font-weight:700}
th:first-child{border-radius:8px 0 0 0}
th:last-child{border-radius:0 8px 0 0}
td{padding:9px 14px;border-bottom:1px solid #eee;vertical-align:top}
tr:nth-child(even) td{background:#faf5ff}
.g{color:#16a34a;font-weight:700}
.r{color:#dc2626;font-weight:700}
.m{color:#7c3aed;font-weight:700}

/* ── 流程图 ── */
.flow{display:flex;align-items:center;justify-content:center;gap:6px;margin:20px 0;flex-wrap:wrap}
.fb{background:#ede9fe;border:2px solid #7c3aed;border-radius:9px;padding:12px 16px;text-align:center;font-size:12px;font-weight:700;color:#3b0764;min-width:100px}
.fa{font-size:18px;color:#7c3aed;font-weight:700}

/* ── 时间线 ── */
.timeline{border-left:3px solid #7c3aed;padding-left:22px;margin:16px 0}
.tl-item{margin-bottom:18px;position:relative}
.tl-item::before{content:'';position:absolute;left:-28px;top:4px;width:10px;height:10px;background:#7c3aed;border-radius:50%;border:2px solid #fff}
.tl-item .yr{font-size:11px;font-weight:800;color:#7c3aed;letter-spacing:1px}
.tl-item p{margin:3px 0 0;color:#333}

/* ── 结论 ── */
.concl{background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;border-radius:12px;padding:32px 36px;margin-top:40px}
.concl h2{font-size:17px;color:#fff;margin-bottom:16px}
.concl li{color:#ddd6fe;margin-bottom:9px;line-height:1.8}

.footer{margin-top:44px;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#bbb;text-align:center}
.pb{page-break-before:always}
</style>
</head>
<body>

<!-- ══ 封面 ══ -->
<div class="cover">
  <div class="badge">游戏行业深度调研 · 2026</div>
  <h1>AI投放在游戏行业的应用<br>市场调研报告</h1>
  <div class="sub">
    全球买量平台格局 · AI素材生成与策略AI · ROI优化实践<br>
    合规挑战 · 国内外厂商案例 · 未来演进路径
  </div>
  <div class="meta">POA Master · 洞察研究部 · 2026年2月26日</div>
</div>

<!-- ══ 执行摘要 ══ -->
<div class="exec">
  <h2>执行摘要</h2>
  <p>
    2025—2026年是AI技术对游戏广告投放完成"范式重构"的关键窗口期。
    全球移动游戏用户获取支出达 <strong>250亿美元</strong>，中国游戏市场实销收入突破 <strong>3508亿元</strong>，
    而驱动增长的核心引擎已从"人工优化"全面切换至"AI自动出价 + AIGC素材 + 策略算法"三位一体的体系。
    AppLovin凭借AXON 2.0广告收入单季暴增71%；Meta Advantage+年收入超200亿美元；
    三七互娱AI投放占比达50%、投放效率提升70%。
    与此同时，行业正进入"AI对AI"的新竞争阶段——单纯堆量素材已无优势，
    <strong>策略理解力才是2026年的核心护城河</strong>。
    本报告系统梳理平台格局、技术能力、实战案例、合规风险与未来演进路径，
    并提出对我司投放策略的四项可落地建议。
  </p>
</div>

<!-- ══ 第一章 ══ -->
<h2 class="sec"><span class="n">1</span>市场全景：规模、结构与三大信号</h2>

<h3>1.1 整体市场规模</h3>
<div class="grid3">
  <div class="card">
    <div class="big">250亿$</div>
    <div class="label">2025年全球移动游戏UA支出</div>
    <div class="src">+3.8% YoY · Sensor Tower</div>
  </div>
  <div class="card">
    <div class="big">3508亿</div>
    <div class="label">2025年中国游戏市场实销收入（元）</div>
    <div class="src">+7.68% YoY · 中国音数协</div>
  </div>
  <div class="card">
    <div class="big">204亿$</div>
    <div class="label">2025年自研游戏海外实销收入</div>
    <div class="src">+10.23%，连续六年超千亿元</div>
  </div>
  <div class="card">
    <div class="big">669亿</div>
    <div class="label">2025年中国AI营销市场规模（元）</div>
    <div class="src">CAGR 26.2% · 易观分析</div>
  </div>
  <div class="card">
    <div class="big">+20%</div>
    <div class="label">2025年移动游戏广告展示量增幅</div>
    <div class="src">付费激活占比同步+10%</div>
  </div>
  <div class="card">
    <div class="big">6.83亿</div>
    <div class="label">2025年中国游戏用户规模（历史峰值）</div>
    <div class="src">中国音数协游戏报告</div>
  </div>
</div>

<h3>1.2 三大结构性信号</h3>
<ul>
  <li>
    <strong>预算集中 + 新兴市场崛起</strong>：美国吸引近50%全球UA预算；
    土耳其（+29%）、印度（+19%）成增量洼地。
    头部广告主（季度投放超400万美元）单季素材产量达 <strong>2400–2600个版本</strong>，同比增长25%–30%。
  </li>
  <li>
    <strong>iOS回暖</strong>：iOS投放规模同比+6%，Android仅+2%，两平台差距收窄至8%，
    SKAdNetwork适配成熟度提升推动iOS信心回归。
  </li>
  <li>
    <strong>AI全面接管出价层</strong>：AppLovin/Meta/Google三大平台已将AI自动出价设为默认模式，
    传统"精细化手动拆广告组"的方法论价值大幅压缩，
    核心竞争力转向"给平台AI喂好信号的能力"。
  </li>
</ul>

<!-- ══ 第二章 ══ -->
<div class="pb"></div>
<h2 class="sec"><span class="n">2</span>平台格局：五大AI投放系统深度对比</h2>

<p>当前游戏买量市场已形成"三大国际平台 + 两大国内生态"格局，各平台AI路径差异显著：</p>

<table>
  <tr>
    <th>平台</th>
    <th>核心AI系统</th>
    <th>游戏行业优势</th>
    <th>主要局限</th>
    <th>代表数据</th>
  </tr>
  <tr>
    <td><strong>AppLovin</strong></td>
    <td>AXON 2.0<br><small>事件级强化学习，不依赖用户图谱</small></td>
    <td class="g">手游精准获客<br>游戏UA市占率>30%</td>
    <td>覆盖范围不及Meta/Google</td>
    <td>2025Q1广告收入+71%<br>达11.6亿美元</td>
  </tr>
  <tr>
    <td><strong>Meta<br>Advantage+</strong></td>
    <td>神经网络匹配<br><small>受众、创意、归因全链自动化</small></td>
    <td class="g">34.8亿DAU覆盖<br>社交信号强，需求创造型</td>
    <td>iOS隐私限制后归因质量下降</td>
    <td>Advantage+年收入>200亿$<br>机会分数工具一键AI优化</td>
  </tr>
  <tr>
    <td><strong>Google<br>PMax</strong></td>
    <td>Performance Max<br><small>全渠道AI出价，高意图捕获</small></td>
    <td class="g">搜索意图信号强<br>YouTube品效合一</td>
    <td>创意控制权低，黑盒感强</td>
    <td>AI Max 2025：关键词级AI推荐</td>
  </tr>
  <tr>
    <td><strong>字节<br>巨量引擎</strong></td>
    <td>UBMAX自动出价<br><small>+可灵AI素材生成</small></td>
    <td class="g">国内游戏首选<br>直播+短视频协同</td>
    <td>出海合规受限，海外覆盖有限</td>
    <td>游戏广告收入约550亿元/年<br>占字节总广告收入46%</td>
  </tr>
  <tr>
    <td><strong>腾讯广告</strong></td>
    <td>妙思创意平台<br><small>+广告3.0智能投放</small></td>
    <td class="g">微信/小游戏生态闭环<br>社交裂变免摩擦跳转</td>
    <td>封闭生态，外部游戏导量有限</td>
    <td>小游戏SLG广告增速+180% YoY</td>
  </tr>
</table>

<div class="info">
  <div class="tag">✅ 平台组合建议</div>
  <p>
    <strong>出海：</strong>AppLovin（精准）+ Meta Advantage+（量级）双轨为主，Google PMax补高意图层。<br>
    <strong>国内：</strong>巨量引擎为主力，腾讯广告聚焦小游戏闭环。<br>
    避免单一平台依赖，降低算法波动与平台政策风险。
  </p>
</div>

<!-- ══ 第三章 ══ -->
<h2 class="sec"><span class="n">3</span>AI素材：从生产工具到策略壁垒</h2>

<h3>3.1 AIGC在游戏广告中的渗透率</h3>
<div class="grid2">
  <div class="card">
    <div class="big">~40%</div>
    <div class="label">头部游戏广告公司AI素材渗透率（行业整体约10%）</div>
    <div class="src">腾讯新闻调研数据 2025</div>
  </div>
  <div class="card">
    <div class="big">>70%</div>
    <div class="label">三七互娱AI深度参与视频广告素材占比</div>
    <div class="src">2D资产AI生成>80%，季产超50万张</div>
  </div>
  <div class="card">
    <div class="big">5x+</div>
    <div class="label">AI素材制作效率提升倍数</div>
    <div class="src">成本可降至传统方式的1/3~1/10</div>
  </div>
  <div class="card">
    <div class="big">2~3h</div>
    <div class="label">30秒高质量视频素材AI生产周期</div>
    <div class="src">传统人工需整整一天</div>
  </div>
</div>

<h3>3.2 主要AI素材工具链</h3>
<table>
  <tr><th>工具类型</th><th>代表产品</th><th>游戏广告适用场景</th><th>效果数据</th></tr>
  <tr>
    <td>视频生成</td>
    <td>可灵（快手）、Sora、Runway</td>
    <td>游戏CG预告、玩法演示、真人口播</td>
    <td>产出速度提升5–10倍</td>
  </tr>
  <tr>
    <td>图像生成</td>
    <td>Midjourney、DALL·E 3、SD</td>
    <td>角色立绘、场景原画、广告Banner</td>
    <td>日产量从百张提升至数千张</td>
  </tr>
  <tr>
    <td>脚本与文案</td>
    <td>DeepSeek、GPT-4o、Coze工作流</td>
    <td>多语言本地化、A/B测试文案批量生成</td>
    <td>本地化效率提升60%–80%</td>
  </tr>
  <tr>
    <td>平台原生AI创意</td>
    <td>Meta Advantage+ Creative<br>Google Asset Studio</td>
    <td>素材自动裁剪、背景替换、文字叠加</td>
    <td>CTR平均提升15%–24%</td>
  </tr>
  <tr>
    <td>策略分析AI</td>
    <td>AppGrowing AI分析、SensorTower AI</td>
    <td>竞品素材拆解、爆款标签识别、趋势预判</td>
    <td>快速锁定跑量素材方向</td>
  </tr>
</table>

<h3>3.3 核心判断："量产"已死，"策略理解"才是护城河</h3>
<div class="hl">
  <div class="tag">⚡ 2026年关键转变</div>
  <p>
    广告平台AI（AXON 2.0 / Advantage+ / UBMAX）已能解析素材的画面语义和情绪内涵，
    <strong>单纯靠AIGC堆量已不再产生差异化优势</strong>，
    跑量概率未提升，试错成本反而上升。
    真正的护城河在于用AI理解"哪类素材为什么跑量"，再定向生产——
    形成"数据洞察 → 策略制定 → AIGC生产 → 投放验证"的闭环飞轮，
    而非单向的素材生产流水线。
  </p>
</div>

<div class="flow">
  <div class="fb">竞品情报<br>AI分析</div><div class="fa">→</div>
  <div class="fb">素材标签<br>策略制定</div><div class="fa">→</div>
  <div class="fb">AIGC批量<br>生产</div><div class="fa">→</div>
  <div class="fb">平台AI<br>自动投放</div><div class="fa">→</div>
  <div class="fb">效果数据<br>回流学习</div>
</div>

<!-- ══ 第四章 ══ -->
<div class="pb"></div>
<h2 class="sec"><span class="n">4</span>ROI优化实践：数据与标杆案例</h2>

<h3>4.1 行业ROI提升基准数据</h3>
<div class="grid3">
  <div class="card">
    <div class="big">+71%</div>
    <div class="label">AppLovin 2025Q1广告收入同比增速</div>
    <div class="src">AXON 2.0驱动，财报数据</div>
  </div>
  <div class="card">
    <div class="big">+78%</div>
    <div class="label">荣耀广告AI优化后ROI正向提升率</div>
    <div class="src">HGDC 2025内测数据</div>
  </div>
  <div class="card">
    <div class="big">17~28%</div>
    <div class="label">企业采用AI营销工具平均ROI增幅</div>
    <div class="src">全球63%企业已部署生成式AI</div>
  </div>
</div>

<h3>4.2 三七互娱：国内AI投放最完整的标杆案例</h3>
<table>
  <tr><th>维度</th><th>传统模式</th><th>AI赋能后</th><th>提升幅度</th></tr>
  <tr>
    <td>全天广告上线时间</td>
    <td>6小时</td>
    <td class="g">30分钟</td>
    <td class="m">效率↑10倍+</td>
  </tr>
  <tr>
    <td>AI自动投放占比</td>
    <td>—</td>
    <td class="g">50%</td>
    <td class="m">整体投放效率↑70%</td>
  </tr>
  <tr>
    <td>AI参与视频广告素材占比</td>
    <td>—</td>
    <td class="g">&gt;70%</td>
    <td class="m">素材成本↓50%+</td>
  </tr>
  <tr>
    <td>AI辅助代码研发效率</td>
    <td>基准</td>
    <td class="g">提升30%</td>
    <td class="m">开发周期压缩</td>
  </tr>
  <tr>
    <td>智能客服处理用户问题占比</td>
    <td>—</td>
    <td class="g">70%</td>
    <td class="m">人力成本↓60%</td>
  </tr>
  <tr>
    <td>净利润（2025前三季度）</td>
    <td>19.0亿元</td>
    <td class="g">23.45亿元</td>
    <td class="m">同比↑23.57%</td>
  </tr>
</table>

<h3>4.3 AppLovin：剥离游戏押注广告AI的战略启示</h3>
<p>
  AppLovin以<strong>8亿美元出售全部游戏工作室</strong>，将资源全力投入AXON广告技术研发，
  是行业最具参考价值的战略转型案例。核心逻辑：
  <strong>游戏是数据资产，AI广告技术才是真正的变现护城河</strong>。
  AXON 2.0的强化学习依赖游戏内互动数据——每次广告互动产生数十个反馈信号，
  数据飞轮越转越快，竞争壁垒随之加深，并已开始向电商场景溢出
  （最大电商客户2025年预算增长6倍）。
</p>

<h3>4.4 出海买量ROI的三大现实挑战</h3>
<ul>
  <li><strong>成本高企</strong>：美国市场拉一个付费用户约需15美元，ROI回收周期普遍拉长至90天+，对现金流形成压力</li>
  <li><strong>归因失真</strong>：iOS SKAdNetwork延迟报告导致D7/D14 ROAS数据失真，AI模型需接入增量归因校正</li>
  <li><strong>新兴市场LTV低</strong>：土耳其/印度增速高但支付率不稳，需AI动态调整出价策略实现分市场精细化</li>
</ul>

<!-- ══ 第五章 ══ -->
<h2 class="sec"><span class="n">5</span>合规风险：进入"ROI硬约束"时代</h2>

<h3>5.1 中国个人信息保护法的直接影响</h3>
<ul>
  <li><strong>数据采集限制</strong>：用户画像跨平台共享受到严格约束，依赖第三方SDK的精准定向能力大幅削弱</li>
  <li><strong>AIGC内容合规</strong>：AI生成广告素材须满足"深度合成服务管理办法"，明确标注AI生成标识</li>
  <li><strong>未成年人保护</strong>：游戏广告定向须内置年龄排除逻辑，违规罚款大幅提升</li>
</ul>

<h3>5.2 全球合规压力矩阵</h3>
<table>
  <tr><th>地区</th><th>核心法规</th><th>对AI投放的影响</th><th>应对策略</th></tr>
  <tr>
    <td><strong>中国</strong></td>
    <td>个保法 + 网络安全法<br>深度合成管理办法</td>
    <td>第三方数据受限，AIGC须合规标注</td>
    <td>建设第一方数据资产，优先用平台原生AI</td>
  </tr>
  <tr>
    <td><strong>欧盟</strong></td>
    <td>GDPR + DSA数字服务法</td>
    <td>精准定向须用户明确授权</td>
    <td>Contextual AI替代行为定向，隐私沙盒适配</td>
  </tr>
  <tr>
    <td><strong>美国</strong></td>
    <td>各州隐私法（CPRA等）<br>FTC AI广告指引</td>
    <td>跨App追踪受限，AI决策透明度要求提升</td>
    <td>Server-to-Server归因 + 增量测量替代点击归因</td>
  </tr>
  <tr>
    <td><strong>东南亚</strong></td>
    <td>各国数据保护法草案</td>
    <td>合规成本上升，审查周期长</td>
    <td>本地化合规团队 + AI合规自检流程</td>
  </tr>
</table>

<div class="warn">
  <div class="tag">⚠️ 核心矛盾</div>
  <p>
    合规要求正在强制行业从"数据驱动"切换为"技术驱动"——
    当行为数据越来越难以获取，<strong>平台AI的模型质量和素材本身的内容质量</strong>
    成为投放效率的最关键变量。
    "黑盒出价"的平台AI必须通过可验证的ROI审计来证明价值，这是当前行业的核心博弈点。
  </p>
</div>

<!-- ══ 第六章 ══ -->
<div class="pb"></div>
<h2 class="sec"><span class="n">6</span>演进路径：AI投放的过去、现在与未来</h2>

<div class="timeline">
  <div class="tl-item">
    <div class="yr">2020–2022 · 人工精细化运营时代</div>
    <p>投放人员靠经验拆广告组，手动出价，素材靠团队手工制作。平台算法是辅助工具，人是核心决策层。</p>
  </div>
  <div class="tl-item">
    <div class="yr">2023 · AI出价元年</div>
    <p>AppLovin AXON 2.0发布，广告收入开始暴涨。Meta发布Advantage+套件，Google PMax大规模推广。AI出价开始系统性替代手工出价，传统精细化运营方法论开始失效。</p>
  </div>
  <div class="tl-item">
    <div class="yr">2024 · AIGC素材爆发期</div>
    <p>Midjourney V6、Sora、可灵相继发布，素材生产效率飞跃。游戏广告公司开始系统引入AI素材流水线，素材数量呈指数增长，行业素材红利期开始。</p>
  </div>
  <div class="tl-item">
    <div class="yr">2025 · AI对AI博弈开始</div>
    <p>平台AI已能理解素材语义，纯堆量失效。AppLovin出售游戏业务全力押注广告AI，iOS/Android平台差距收窄，归因技术持续演进。行业开始关注"策略理解型AI"。</p>
  </div>
  <div class="tl-item">
    <div class="yr">2026（当前）· 策略AI时代</div>
    <p><strong>以"数据理解→策略制定"为核心的策略AI工具崛起。</strong>胜负手从"谁产出素材多"变为"谁能用AI更好地理解市场和用户意图"。业界共识：<em>"把AI作为策略操作系统的团队才可能赢得增长权"</em>。</p>
  </div>
  <div class="tl-item">
    <div class="yr">2027–2028（预测）· AI Agent全自动投放</div>
    <p>从策略制定到素材生成、出价调整、报告分析，全链条AI Agent自动化。人类投放团队向"AI监督官"角色转型，聚焦规则制定和边界管理，而非执行层操作。</p>
  </div>
</div>

<!-- ══ 结论 ══ -->
<div class="concl">
  <h2>结论：对我司投放策略的四项建议</h2>
  <ul>
    <li>
      <strong>【建议一：建设第一方数据资产，摆脱平台数据依赖】</strong>
      加速建设游戏内用户行为数据资产（登录、付费、活跃行为埋点），减少对第三方SDK数据的依赖。
      率先完成第一方数据基建的厂商，将在个保法/GDPR收紧的合规红利期占得先机。
    </li>
    <li>
      <strong>【建议二：将AI素材升级为"策略+生产"二元体系】</strong>
      引入AI策略分析工具（AppGrowing、SensorTower竞品洞察）先理解"爆量的原因"，
      再用AIGC批量生产，形成理解→生产→验证的闭环飞轮，而非单向堆量流水线。
    </li>
    <li>
      <strong>【建议三：平台双轨组合，降低单一平台依赖风险】</strong>
      出海优先AppLovin（精准）+ Meta Advantage+（量级）双轨；
      国内以巨量引擎为主力，腾讯广告聚焦小游戏闭环场景；
      Google PMax作为高意图补量层。
    </li>
    <li>
      <strong>【建议四：启动ROI可验证性建设，应对合规硬约束】</strong>
      建立独立的增量归因测量体系（Media Mix Model + A/B Holdout），摆脱平台黑盒归因。
      在AI投放工具链中内置合规检查（AIGC标识、年龄门控、数据最小化原则），
      提前为监管审计做好准备。
    </li>
  </ul>
</div>

<div class="footer">
  本报告由 POA Master COO AI 助手生成 · 数据来源：Sensor Tower、中国音数协、AppLovin财报、Meta官方、三七互娱财报、36氪、腾讯新闻等公开资料 · 2026-02-26
</div>

</body>
</html>`;
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('📊 开始生成AI投放游戏行业调研报告...');

  // 1. 生成 PDF
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setContent(buildHTML(), { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
  });
  await browser.close();
  console.log(`✅ PDF 生成完成，大小：${(pdf.length / 1024).toFixed(0)} KB`);

  // 本地副本
  const outPath = path.join(process.cwd(), 'ai-adtech-game-report.pdf');
  fs.writeFileSync(outPath, pdf);
  console.log(`💾 本地副本：${outPath}`);

  // 2. 获取飞书配置
  const chatId = await getConfig('feishu.chatId');
  if (!chatId) {
    console.error('❌ feishu.chatId 未配置，请在系统设置中配置');
    process.exit(1);
  }

  // 3. 上传 & 发送
  console.log('📤 正在上传至飞书...');
  const token = await getTenantToken();
  const fileName = `AI投放游戏行业调研报告-${new Date().toISOString().slice(0, 10)}.pdf`;
  const fileKey = await uploadPDF(Buffer.from(pdf), fileName, token);
  console.log(`✅ 上传成功，file_key: ${fileKey}`);

  await sendFileMsg(chatId, fileKey, token);
  console.log('🎉 报告已成功发送至飞书群聊！');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('❌ 错误：', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
