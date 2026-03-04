/**
 * 生成《率土之滨爽玩版（青春服）深度研究报告》并通过飞书发送
 * 运行方式：npx tsx scripts/send-stzb-casual-report-feishu.ts
 */

import puppeteer from 'puppeteer';
import { PrismaClient } from '@prisma/client';
import { createDecipheriv } from 'crypto';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

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

function buildHTML(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>率土之滨爽玩版（青春服）深度研究报告 2025</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;font-size:13px;line-height:1.8;color:#1a1a2e;background:#fff;padding:48px 56px}

/* 封面 */
.cover{text-align:center;padding:70px 0 55px;border-bottom:3px solid #c0392b;margin-bottom:42px;background:linear-gradient(135deg,#fff5f5,#fff)}
.cover .badge{display:inline-block;background:#c0392b;color:#fff;font-size:11px;font-weight:700;letter-spacing:1.5px;padding:4px 18px;border-radius:20px;margin-bottom:18px}
.cover h1{font-size:28px;font-weight:900;line-height:1.4;color:#2c0a0a;margin-bottom:12px}
.cover .sub{font-size:13px;color:#666;margin-bottom:24px;line-height:2}
.cover .meta{font-size:11px;color:#aaa}
.cover .tag-row{display:flex;justify-content:center;gap:10px;margin-bottom:20px;flex-wrap:wrap}
.cover .tag{background:#fef2f2;color:#c0392b;border:1px solid #fca5a5;padding:4px 12px;border-radius:12px;font-size:11px;font-weight:600}

/* 执行摘要 */
.exec{background:linear-gradient(135deg,#fef2f2,#fff5f5);border-left:4px solid #c0392b;border-radius:0 10px 10px 0;padding:22px 28px;margin-bottom:38px}
.exec h2{font-size:13px;font-weight:800;color:#c0392b;margin-bottom:10px;letter-spacing:.5px}
.exec p{color:#333;font-size:13px;line-height:1.9}

/* 章节标题 */
h2.sec{font-size:17px;font-weight:800;color:#2c0a0a;padding-bottom:8px;border-bottom:2px solid #fca5a5;margin:38px 0 16px}
h2.sec .n{display:inline-block;width:27px;height:27px;background:#c0392b;color:#fff;border-radius:50%;font-size:12px;line-height:27px;text-align:center;margin-right:10px;vertical-align:middle}
h3{font-size:14px;font-weight:700;color:#7f1d1d;margin:20px 0 9px}
p{margin-bottom:10px;color:#333}
ul,ol{padding-left:20px;margin-bottom:12px}
li{margin-bottom:7px;color:#333}

/* 数据卡片 */
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:16px 0}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:16px 0}
.grid4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin:16px 0}
.card{background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;padding:16px}
.card .big{font-size:28px;font-weight:800;color:#c0392b;line-height:1.1}
.card .label{font-size:11px;color:#555;margin-top:5px;line-height:1.5}
.card .src{font-size:10px;color:#aaa;margin-top:3px}

/* 对比卡片 */
.vs-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin:16px 0}
.vs-old{background:#f8f8f8}
.vs-new{background:#fef2f2}
.vs-head{padding:12px 18px;font-size:13px;font-weight:800;text-align:center}
.vs-old .vs-head{background:#374151;color:#fff}
.vs-new .vs-head{background:#c0392b;color:#fff}
.vs-body{padding:16px 18px;font-size:12px}
.vs-body ul{padding-left:16px}
.vs-body li{margin-bottom:8px;color:#444}

/* 概念框 */
.concept{background:#fef2f2;border:1.5px solid #fca5a5;border-radius:10px;padding:18px 22px;margin:16px 0}
.concept .ctag{font-size:11px;font-weight:800;color:#7f1d1d;letter-spacing:1px;margin-bottom:9px}
.concept p{color:#444;margin:0;font-size:13px}

.info{background:#eff6ff;border:1px solid #bfdbfe;border-radius:9px;padding:15px 19px;margin:13px 0}
.info .itag{font-size:11px;font-weight:800;color:#1e40af;letter-spacing:1px;margin-bottom:7px}
.info p{color:#1e3a5f;margin:0}

.warn{background:#fff7ed;border:1px solid #fed7aa;border-radius:9px;padding:15px 19px;margin:13px 0}
.warn .wtag{font-size:11px;font-weight:800;color:#9a3412;letter-spacing:1px;margin-bottom:7px}
.warn p{color:#444;margin:0}

.success{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:9px;padding:15px 19px;margin:13px 0}
.success .stag{font-size:11px;font-weight:800;color:#15803d;letter-spacing:1px;margin-bottom:7px}
.success p{color:#14532d;margin:0}

/* 机制卡片 */
.mech-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:16px 0}
.mech{border-radius:10px;overflow:hidden;border:1px solid #e5e7eb}
.mech .mh{padding:10px 14px;font-size:12px;font-weight:700;display:flex;align-items:center;gap:8px;color:#fff}
.mech .mb{padding:14px;background:#fff;font-size:12px}
.mech .mb .before{color:#888;text-decoration:line-through;margin-bottom:4px}
.mech .mb .after{font-weight:700;color:#c0392b;margin-bottom:4px}
.mech .mb .note{font-size:11px;color:#888;font-style:italic}
.m1 .mh{background:#c0392b}
.m2 .mh{background:#16a34a}
.m3 .mh{background:#1d4ed8}
.m4 .mh{background:#7c3aed}
.m5 .mh{background:#b45309}
.m6 .mh{background:#0f766e}

/* 竞品矩阵 */
.comp-table table{width:100%;border-collapse:collapse;margin:14px 0;font-size:11.5px}
.comp-table th{background:#c0392b;color:#fff;padding:9px 12px;text-align:left;font-weight:700;font-size:11px}
.comp-table td{padding:9px 12px;border-bottom:1px solid #eee;vertical-align:top}
.comp-table tr:nth-child(even) td{background:#fef2f2}
.comp-table tr.highlight td{background:#fff5f5;font-weight:700}

/* 时间轴 */
.timeline{margin:16px 0;position:relative;padding-left:28px}
.timeline::before{content:'';position:absolute;left:8px;top:0;bottom:0;width:2px;background:#fca5a5}
.tl-item{position:relative;margin-bottom:18px}
.tl-dot{position:absolute;left:-24px;top:4px;width:12px;height:12px;background:#c0392b;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 2px #c0392b}
.tl-date{font-size:10px;font-weight:800;color:#c0392b;margin-bottom:3px;letter-spacing:.5px}
.tl-content{font-size:12px;color:#333;line-height:1.7}
.tl-tag{display:inline-block;background:#fef2f2;color:#c0392b;border:1px solid #fca5a5;padding:1px 8px;border-radius:8px;font-size:10px;margin-bottom:4px}

/* 用户画像 */
.persona-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin:16px 0}
.persona{border-radius:10px;padding:18px;text-align:center}
.persona .icon{font-size:28px;margin-bottom:8px}
.persona .pname{font-size:13px;font-weight:800;margin-bottom:6px}
.persona .pdesc{font-size:11px;color:#666;line-height:1.6}
.p1{background:#fef2f2;border:1px solid #fca5a5}
.p2{background:#eff6ff;border:1px solid #bfdbfe}
.p3{background:#f0fdf4;border:1px solid #bbf7d0}

/* 结论 */
.concl{background:linear-gradient(135deg,#7f1d1d,#c0392b);color:#fff;border-radius:12px;padding:30px 34px;margin-top:36px}
.concl h2{font-size:16px;color:#fff;margin-bottom:14px}
.concl li{color:#fef2f2;margin-bottom:9px;line-height:1.8}
.concl strong{color:#fff}

/* 表格 */
table{width:100%;border-collapse:collapse;margin:14px 0;font-size:12px}
th{background:#c0392b;color:#fff;padding:10px 13px;text-align:left;font-weight:700}
th:first-child{border-radius:8px 0 0 0}th:last-child{border-radius:0 8px 0 0}
td{padding:9px 13px;border-bottom:1px solid #eee;vertical-align:top}
tr:nth-child(even) td{background:#fef2f2}
.g{color:#15803d;font-weight:700}.r{color:#b91c1c;font-weight:700}.m{color:#7c3aed;font-weight:700}
.y{color:#b45309;font-weight:700}

.footer{margin-top:40px;padding-top:14px;border-top:1px solid #eee;font-size:11px;color:#bbb;text-align:center}
.pb{page-break-before:always}
</style>
</head>
<body>

<!-- 封面 -->
<div class="cover">
  <div class="badge">SLG品类研究 · 2025-2026</div>
  <h1>率土之滨爽玩版（青春服）<br>深度研究报告</h1>
  <div class="tag-row">
    <span class="tag">🎮 网易游戏</span>
    <span class="tag">📅 2025年3月正式上线</span>
    <span class="tag">⚡ 降肝减氪</span>
    <span class="tag">🔄 免费抽卡</span>
    <span class="tag">📈 热度翻倍</span>
  </div>
  <div class="sub">
    产品设计机制全拆解 · 用户增长与市场数据 · 竞品格局对比<br>
    SLG轻量化趋势研判 · 对我司产品的战略启示
  </div>
  <div class="meta">POA Master · 洞察研究部 · 2026年2月28日</div>
</div>

<!-- 执行摘要 -->
<div class="exec">
  <h2>执行摘要</h2>
  <p>
    《率土之滨》爽玩版（2025年3月27日以"青春服"形式正式上线）是近年来SLG赛道最值得深度研究的产品创新。
    它以<strong>"免费抽卡+资源翻倍+系统减负"三板斧</strong>，
    在不改变核心战略竞技体验的前提下，成功实现老玩家大规模回流和新用户快速入坑——
    相关抖音话题播放量超4.3亿次，苹果平台下载量创历史新高（超80万），
    上线百余个服务器均达到爆满排队状态。
    爽玩版证明了一个核心命题：<strong>SLG的"难"并非生命力的来源，"策略竞争的公平感"才是核心魅力</strong>。
    移除付费碾压屏障后，真实策略博弈的对抗性反而更加凸显，
    打破了行业对三国SLG已进入"存量缩圈"阶段的固有认知。
    本报告系统拆解其设计哲学、机制改动细节、市场数据与竞品格局，
    并结合我司SLG产品现状给出可执行的参考建议。
  </p>
</div>

<!-- 第一章：产品背景 -->
<h2 class="sec"><span class="n">1</span>产品背景：十年老IP的自我革命</h2>

<h3>1.1 率土之滨基本盘</h3>
<div class="grid4">
  <div class="card">
    <div class="big">10年</div>
    <div class="label">网易《率土之滨》运营年限，2015年上线</div>
    <div class="src">网易官方</div>
  </div>
  <div class="card">
    <div class="big">百万级</div>
    <div class="label">月活跃用户规模，每季度DAU与营收持续新高</div>
    <div class="src">TapTap数据 2025</div>
  </div>
  <div class="card">
    <div class="big">T1</div>
    <div class="label">国内SLG市场竞争层级（仅次于无尽冬日T0）</div>
    <div class="src">2025年国内SLG格局分析</div>
  </div>
  <div class="card">
    <div class="big">首创</div>
    <div class="label">率土-like开创"百格大地图+兵种克制"SLG新范式</div>
    <div class="src">游研社</div>
  </div>
</div>

<p>
  《率土之滨》是中国SLG赛道的奠基性产品，以"200万格大世界、数百武将、真实兵种克制"
  为核心，开创了"率土-like"子品类。然而经典服在10年迭代中积累了大量"历史包袱"：
  天气系统、宝物系统、文臣政策、复杂的战法拆解机制……
  同时付费碾压问题突出，大R氪金购买的稀有武将与策略层面拉开碾压级差距，
  使非付费玩家的策略乐趣大幅流失。
</p>

<div class="warn">
  <div class="wtag">⚠️ 经典服的核心痛点</div>
  <p>
    经典服的三大结构性问题：①<strong>付费碾压</strong>——稀有武将获取高度依赖氪金，非付费玩家战力上限被硬性封死；
    ②<strong>时间压迫</strong>——行军距离限制、定时攻城需要"定闹钟守着打"，
    强社交绑定使游戏成为"24小时工作"；
    ③<strong>系统复杂度过高</strong>——天气、宝物、文臣等系统叠加，
    新手学习曲线极陡，劝退大量潜在用户。
  </p>
</div>

<h3>1.2 爽玩版的诞生逻辑</h3>
<p>
  2024年末，开发团队开始立项"爽玩版"：在保留率土-like核心竞技机制（大地图行军、联盟对战、赛季结算）的前提下，
  系统性剔除付费碾压因素和时间压迫设计，
  让"策略博弈"而非"氪金深度"成为胜负的决定性变量。
</p>

<!-- 第一章时间轴 -->
<div class="timeline">
  <div class="tl-item">
    <div class="tl-dot"></div>
    <div class="tl-date">2024年12月</div>
    <div class="tl-tag">立项</div>
    <div class="tl-content">爽玩版立项，内部代号"掀桌测试"，目标：彻底解决付费碾压与时间压迫问题</div>
  </div>
  <div class="tl-item">
    <div class="tl-dot"></div>
    <div class="tl-date">2025年1月14日</div>
    <div class="tl-tag">内测</div>
    <div class="tl-content">青春服首批内测开启，玩家热情超预期——测试期包工"到第8个服务器才排进去"，排队超1.5小时</div>
  </div>
  <div class="tl-item">
    <div class="tl-dot"></div>
    <div class="tl-date">2025年3月27日</div>
    <div class="tl-tag">公测</div>
    <div class="tl-content">青春服正式上线，首批服务器迅速爆满，开始持续扩服，官方宣布投入1亿元"开荒节"活动</div>
  </div>
  <div class="tl-item">
    <div class="tl-dot"></div>
    <div class="tl-date">2025年6月5日</div>
    <div class="tl-tag">首赛季结算</div>
    <div class="tl-content">青春服S1赛季结算（约2个月赛季周期），数据表现优秀，正式进入持续运营阶段</div>
  </div>
  <div class="tl-item">
    <div class="tl-dot"></div>
    <div class="tl-date">2025年12月26日</div>
    <div class="tl-tag">爽玩版正式命名</div>
    <div class="tl-content">官方正式以"爽玩版"命名该模式，并进行更大规模扩展，12月热度指数达到近半年峰值，近乎翻倍</div>
  </div>
  <div class="tl-item">
    <div class="tl-dot"></div>
    <div class="tl-date">2025全年</div>
    <div class="tl-tag">持续增长</div>
    <div class="tl-content">开设100+服务器，苹果平台下载量突破80万创历史新高，抖音话题播放量超4.3亿次</div>
  </div>
</div>

<!-- 第二章：机制拆解 -->
<div class="pb"></div>
<h2 class="sec"><span class="n">2</span>核心机制拆解：六大改革维度</h2>

<p>爽玩版的设计改动围绕一个核心目标：<strong>将胜负决定权从"氪金深度"还给"策略能力"</strong>。以下是六个维度的具体改动：</p>

<div class="mech-grid">

  <!-- 机制1：抽卡系统 -->
  <div class="mech m1">
    <div class="mh">🎴 改革①：抽卡系统颠覆</div>
    <div class="mb">
      <div class="before">经典服：消耗稀有虎符（付费货币），高价稀有武将</div>
      <div class="after">爽玩服：仅消耗铜钱（免费日常获取），每次必出五星</div>
      <p>铜钱获取路径：日常税收、陈情任务、征战奖励，赛季初期每日数万铜钱，中期（建立分城/民居后）大幅提升。</p>
      <p>首批前10张五星：系统额外赠送同阵营五星武将；EX卡包武将、S2绝版卡均纳入赠送范围。</p>
      <div class="note">本质：彻底拆除"付费壁垒"，所有玩家武将池相同，策略搭配成为唯一核心竞争力</div>
    </div>
  </div>

  <!-- 机制2：资源体系 -->
  <div class="mech m2">
    <div class="mh">📦 改革②：资源产出翻倍</div>
    <div class="mb">
      <div class="before">经典服：标准资源产出，日常奖励不变</div>
      <div class="after">爽玩服：土地产量×2、税收×2、战法经验×2、虎符产出×2</div>
      <p>征兵速度：提升25%，缩短兵力补充等待</p>
      <p>建筑升级时间：整体缩短50%，开荒节奏大幅加速</p>
      <p>陈情/演武奖励：全部翻倍，日常任务价值提升</p>
      <div class="note">开荒节奏：原本需要2周才能完成的初期发育，爽玩服十余小时即可进入正式对战阶段</div>
    </div>
  </div>

  <!-- 机制3：行军系统 -->
  <div class="mech m3">
    <div class="mh">⚔️ 改革③：行军距离全面解除</div>
    <div class="mb">
      <div class="before">经典服：300/500格行军距离限制，全图调兵需多段接力</div>
      <div class="after">爽玩服：移除所有行军距离限制，部队可全图自由调动</div>
      <p>战略价值：联盟可以真正实现跨区域协同作战，"千里驰援"不再受地图格数约束</p>
      <p>节奏影响：战争规模感和紧迫感显著增强，地图战略维度大幅扩展</p>
      <div class="note">评估：这是爽玩服改动中对策略深度影响最大的一项，将游戏从"格数博弈"升级为"真实战略调度"</div>
    </div>
  </div>

  <!-- 机制4：自动化系统 -->
  <div class="mech m4">
    <div class="mh">🤖 改革④：智能自动化功能</div>
    <div class="mb">
      <div class="before">经典服：攻城需手动操作，定时打城要"定闹钟守着"</div>
      <div class="after">爽玩服：新增"攻城营垒"建筑，激活后系统自动组织攻城，无需手动干预</div>
      <p>额外便利功能：自动攻城、脱机收益自动领取、日常任务提醒优化</p>
      <p>体力系统：移除开荒期体力减半设定，新增体力丹道具，体力压迫感降低</p>
      <div class="note">社会意义：彻底解放"24小时守游戏"的时间捆绑，大幅降低游戏对日常生活的侵占</div>
    </div>
  </div>

  <!-- 机制5：系统简化 -->
  <div class="mech m5">
    <div class="mh">🔧 改革⑤：复杂系统精简</div>
    <div class="mb">
      <div class="before">经典服：天气系统、宝物系统、文臣政策、战法拆解、陈寿特性、名号成就、桃源军等</div>
      <div class="after">爽玩服：全部移除上述系统，仅保留武将、战法、行军、联盟四大核心模块</div>
      <p>新手体验：新手教程大幅优化，术语解读更直白，游戏概念减少60%+</p>
      <p>决策层次：简化后武将搭配和战略决策的权重反而提升，干扰项清除后策略更纯粹</p>
      <div class="note">设计哲学：复杂度≠深度，真正的策略深度来自清晰规则下的博弈，而非规则堆叠带来的信息过载</div>
    </div>
  </div>

  <!-- 机制6：赛季设计 -->
  <div class="mech m6">
    <div class="mh">🏆 改革⑥：赛季周期重构</div>
    <div class="mb">
      <div class="before">经典服：赛季周期较长（3-6个月），历史积累差距大，老账号优势明显</div>
      <div class="after">爽玩服：赛季约2个月，每赛季结束武将数据重置，所有人同一起跑线</div>
      <p>心理机制："就算这个赛季输了，下赛季又是一条好汉"——降低挫败感，提升持续参与意愿</p>
      <p>联盟生态：赛季重置催生持续的同盟重组，新生态周期性更新，避免固化</p>
      <div class="note">效果：赛季结算本身成为一次新的社交节点，老玩家习惯性回归，形成周期性增长脉冲</div>
    </div>
  </div>

</div>

<!-- 经典服 vs 爽玩版对比 -->
<h3>2.1 经典服 vs 爽玩版完整对比</h3>
<div class="vs-grid">
  <div class="vs-old">
    <div class="vs-head">经典服</div>
    <div class="vs-body">
      <ul>
        <li>消耗虎符（付费货币）抽卡，稀有度随机</li>
        <li>300/500格行军距离限制</li>
        <li>攻城必须手动操作，定时定闹钟</li>
        <li>天气灾害、宝物、文臣、战法拆解等多系统</li>
        <li>资源产出标准量，建造时间原始值</li>
        <li>开荒期体力减半，节奏极慢</li>
        <li>赛季3-6个月，历史账号积累优势巨大</li>
        <li>新手入坑门槛极高，付费碾压严重</li>
      </ul>
    </div>
  </div>
  <div class="vs-new">
    <div class="vs-head">爽玩版</div>
    <div class="vs-body">
      <ul>
        <li>仅消耗铜钱（免费获取）抽卡，每次必出五星</li>
        <li>全图自由行军，无距离限制</li>
        <li>攻城营垒建筑，全程自动攻城</li>
        <li>仅保留武将/战法/行军/联盟四大核心模块</li>
        <li>资源产出全线×2，建造时间缩短50%</li>
        <li>移除体力减半，新增体力丹，节奏流畅</li>
        <li>赛季约2个月，每赛季重置，公平开荒</li>
        <li>新手门槛大幅降低，零氪可与大R公平竞技</li>
      </ul>
    </div>
  </div>
</div>

<!-- 第三章：市场数据 -->
<div class="pb"></div>
<h2 class="sec"><span class="n">3</span>市场数据与用户增长</h2>

<h3>3.1 核心增长指标</h3>
<div class="grid3">
  <div class="card">
    <div class="big">80万+</div>
    <div class="label">2025年苹果平台下载量（历史新高，比同期竞品高出近50%）</div>
    <div class="src">行业数据报告 2025</div>
  </div>
  <div class="card">
    <div class="big">4.3亿</div>
    <div class="label">抖音"率土青春服"话题累计播放量</div>
    <div class="src">抖音话题数据</div>
  </div>
  <div class="card">
    <div class="big">100+</div>
    <div class="label">开设服务器总数，几乎每个新区均爆满排队</div>
    <div class="src">官方公告</div>
  </div>
  <div class="card">
    <div class="big">×2</div>
    <div class="label">12月声量热度指数（相比近半年平均值翻倍）</div>
    <div class="src">巨量指数数据</div>
  </div>
  <div class="card">
    <div class="big">&lt;1分钟</div>
    <div class="label">正式公测期间单服满员时间（官方10服同时开放）</div>
    <div class="src">官方公告 2025-12-26</div>
  </div>
  <div class="card">
    <div class="big">畅销榜</div>
    <div class="label">微信小游戏上线后迅速冲上畅销榜首位</div>
    <div class="src">微信小游戏榜单</div>
  </div>
</div>

<div class="success">
  <div class="stag">✅ 用户生态质量信号</div>
  <p>
    爽玩版不仅带来新增用户，更重要的是实现了<strong>多代玩家的共存生态</strong>：
    退隐多年的顶级联盟（老玩家社群）纷纷宣布"重出江湖"，
    同时大量SLG新手通过微信小程序"即点即玩"首次体验率土。
    老玩家提供策略深度和联盟文化，新玩家提供数量和新鲜血液——
    两种用户形成互补共生，而非老带新的单向结构。
    这种多代共存的健康生态是SLG产品维持长期生命力的最佳结构。
  </p>
</div>

<h3>3.2 用户行为数据洞察</h3>
<table>
  <tr><th>维度</th><th>经典服痛点</th><th>爽玩版改善数据</th><th>评估</th></tr>
  <tr>
    <td>新手入坑速度</td>
    <td>引导耗时长，前2周发育期冗长</td>
    <td class="g">开荒约10小时即进入对战阶段</td>
    <td class="g">⭐⭐⭐⭐⭐</td>
  </tr>
  <tr>
    <td>武将获取公平感</td>
    <td>强氪玩家武将远超非付费玩家</td>
    <td class="g">全员同等武将池，铜钱日均几万</td>
    <td class="g">⭐⭐⭐⭐⭐</td>
  </tr>
  <tr>
    <td>日常时间占用</td>
    <td>攻城需定时，高峰期几乎全天在线</td>
    <td class="g">自动攻城，摆脱定时绑定</td>
    <td class="g">⭐⭐⭐⭐⭐</td>
  </tr>
  <tr>
    <td>老玩家回流意愿</td>
    <td>历史差距大，回流要从头再氪</td>
    <td class="g">赛季重置，老玩家无需补差距</td>
    <td class="g">⭐⭐⭐⭐⭐</td>
  </tr>
  <tr>
    <td>策略博弈纯粹度</td>
    <td>付费差距干扰策略判断</td>
    <td class="g">武将平权后，阵容搭配成决定性因素</td>
    <td class="g">⭐⭐⭐⭐⭐</td>
  </tr>
  <tr>
    <td>二次传播能量</td>
    <td>普通，主要靠付费买量</td>
    <td class="g">玩家自发大量创作攻略/策略视频内容</td>
    <td class="g">⭐⭐⭐⭐⭐</td>
  </tr>
</table>

<h3>3.3 变现模式：从氪金驱动到体验驱动</h3>
<p>
  爽玩版取消了传统SLG的"核心武将须氪金"逻辑，但并非完全去货币化。
  其变现架构重新设计为：
</p>
<ul>
  <li><strong>体验付费：</strong>保留部分加速类、外观类消费，让愿意付费的用户获得更快/更好看的体验，而非战力碾压</li>
  <li><strong>赏金服模式：</strong>结合"赏金服"机制，提供现金激励（如"征服"排名奖388元现金+3880虎符），用真实奖励驱动竞技热情</li>
  <li><strong>开荒节活动：</strong>官方投入1亿元进行首次开荒节，提供7000万虎符等福利，快速引爆用户基数</li>
  <li><strong>通行证/订阅：</strong>赛季通行证模式，固定金额获得赛季内稳定资源流，适合中度付费用户</li>
</ul>

<div class="concept">
  <div class="ctag">💡 商业模式重构的底层逻辑</div>
  <p>
    爽玩版的本质是将SLG的变现重心从"战力差距付费"转移到"体验深度付费"。
    <strong>不氪金的用户能充分体验策略乐趣，愿意氪金的用户购买的是更快节奏和更好体验——
    而非"不氪就被碾压"的强迫消费。</strong>
    这种模式将长期被压制的大量潜在用户（愿意玩但不愿意被强迫氪金）成功激活，
    通过用户规模的指数级扩张来弥补单用户ARPPU的相对下降。
  </p>
</div>

<!-- 第四章：用户画像 -->
<h2 class="sec"><span class="n">4</span>核心用户画像：三类主力人群</h2>

<div class="persona-grid">
  <div class="persona p1">
    <div class="icon">🧔</div>
    <div class="pname">老玩家回归群体</div>
    <div class="pdesc">
      曾因"氪金太深"或"时间绑定"离开的经典服玩家。
      对率土机制深度熟悉，策略能力强，缺乏的是"公平竞技的场"。
      爽玩版赛季重置机制解除了其回归的核心障碍。
      代表声音："终于不用再从头氪金了"
    </div>
  </div>
  <div class="persona p2">
    <div class="icon">🧑‍🎓</div>
    <div class="pname">SLG新用户/年轻玩家</div>
    <div class="pdesc">
      对率土有印象但被"太肝太氪"劝退的潜在用户。
      通过微信小程序"即点即玩"降低入门门槛。
      对策略游戏有兴趣，但对复杂系统容忍度低。
      代表声音："原来SLG可以不花钱也能玩的很爽"
    </div>
  </div>
  <div class="persona p3">
    <div class="icon">👥</div>
    <div class="pname">联盟/社交驱动玩家</div>
    <div class="pdesc">
      被朋友或联盟拉入的社交导向用户。
      爽玩版的"公平开荒"使其在联盟中不会因武将差距拖累全队。
      属于高留存低ARPPU群体，但带来高传播裂变效果。
      代表声音："盟主说都免费了，大家一起来开服"
    </div>
  </div>
</div>

<div class="info">
  <div class="itag">📊 用户结构对长期运营的意义</div>
  <p>
    三类用户的共存形成了健康的生态闭环：老玩家提供策略深度和联盟文化吸引力 →
    吸引新用户加入 → 新用户的社交裂变传播带来更多用户 → 大基数用户中有一定比例付费 →
    收入支撑持续运营和赛季投入。
    相比经典服"重度付费用户依赖"的脆弱结构，爽玩版构建的是更具韧性的"宽基+深度"双层用户塔。
  </p>
</div>

<!-- 第五章：竞品格局 -->
<div class="pb"></div>
<h2 class="sec"><span class="n">5</span>竞品格局：2025年国内SLG战局</h2>

<h3>5.1 市场竞争层级</h3>
<div class="comp-table">
<table>
  <tr><th>层级</th><th>产品</th><th>厂商</th><th>核心定位</th><th>2025年动态</th><th>率土竞争面</th></tr>
  <tr>
    <td><strong class="r">T0</strong></td>
    <td>《无尽冬日》<br>Whiteout Survival</td>
    <td>世纪华通</td>
    <td>模拟经营×SLG混合，全球出海标杆</td>
    <td class="g">全球累计收入超$20亿，2025年增速45%</td>
    <td class="m">题材差异大，直接竞争有限；出海策略参考价值高</td>
  </tr>
  <tr class="highlight">
    <td><strong class="y">T1</strong></td>
    <td>《率土之滨》<br>（含爽玩版）</td>
    <td>网易</td>
    <td>率土-like纯策略，爽玩版重构公平竞技</td>
    <td class="g">爽玩版热度翻倍，苹果下载量历史新高</td>
    <td>——（本报告主题）</td>
  </tr>
  <tr>
    <td><strong class="y">T1</strong></td>
    <td>《三国志·战略版》</td>
    <td>灵犀互娱</td>
    <td>腾讯渠道+三国正统IP，硬核策略</td>
    <td class="m">S级产品，市场份额稳定但增速趋缓</td>
    <td class="r">直接竞品，三国题材重叠，玩家群高度重合</td>
  </tr>
  <tr>
    <td><strong class="y">T1</strong></td>
    <td>《三国：谋定天下》</td>
    <td>B站/游戏科学</td>
    <td>"不逼肝不逼氪"轻量策略，年轻向</td>
    <td class="g">2025年黑马，轻量化标杆，大量圈粉年轻用户</td>
    <td class="r">与爽玩版定位高度相似，同争轻量化策略用户</td>
  </tr>
  <tr>
    <td><strong class="m">T2</strong></td>
    <td>《三国：冰河时代》</td>
    <td>途游</td>
    <td>RTS自由行军+三国，创新玩法切入</td>
    <td class="m">上榜iOS畅销前列，RTS元素差异化</td>
    <td class="m">部分用户重叠，题材竞争，机制差异明显</td>
  </tr>
  <tr>
    <td><strong class="m">T2</strong></td>
    <td>融合型SLG小游戏<br>（疯狂水世界等）</td>
    <td>多家厂商</td>
    <td>IAA+轻量策略，微信小游戏生态</td>
    <td class="g">增长180%，IAA月活已达4亿</td>
    <td class="m">微信小游戏端直接竞争，但玩法深度差异大</td>
  </tr>
</table>
</div>

<h3>5.2 爽玩版的差异化优势</h3>
<div class="grid2">
  <div class="card">
    <div class="big">IP深度</div>
    <div class="label">率土-like是国产SLG的原创范式，10年积累的玩家情感资产和联盟文化是短期内竞品无法复制的护城河</div>
    <div class="src">竞争优势一</div>
  </div>
  <div class="card">
    <div class="big">策略纯度</div>
    <div class="label">在移除付费碾压后，率土的策略博弈深度（兵种克制、阵型搭配、战法组合）是同赛道最高的，且有大量内容创作空间</div>
    <div class="src">竞争优势二</div>
  </div>
</div>

<div class="warn">
  <div class="wtag">⚠️ 主要竞争威胁</div>
  <p>
    《三国：谋定天下》与爽玩版的定位重合度最高，都主打"轻量化+不氪金"的三国策略。
    B站品牌加持使其在年轻用户群体中具有天然亲和力，且其"不逼肝不逼氪"的设计贯穿始终（非传统服改版），
    在新用户体验一致性上可能优于爽玩版（爽玩版在经典服生态内运作，系统切换有一定认知负担）。
    此外，RTS自由行军是2025年多款新SLG的共同方向，如果该机制验证成功，爽玩版需要跟进以保持操作爽感的竞争力。
  </p>
</div>

<!-- 第六章：SLG趋势研判 -->
<h2 class="sec"><span class="n">6</span>SLG轻量化趋势研判：爽玩版的行业意义</h2>

<h3>6.1 2025年SLG品类的结构性变化</h3>
<div class="grid3">
  <div class="card">
    <div class="big">4.9亿</div>
    <div class="label">2025年H1全球SLG手游海外下载量（同比+10.3%），但收入增速停滞</div>
    <div class="src">2025H1全球SLG报告</div>
  </div>
  <div class="card">
    <div class="big">180%</div>
    <div class="label">SLG小游戏品类2025年H1增长幅度，轻量化赛道逆势爆发</div>
    <div class="src">36氪数据</div>
  </div>
  <div class="card">
    <div class="big">6款</div>
    <div class="label">2025年上榜iOS畅销前列的传统SLG新产品中，6款主打RTS自由行军</div>
    <div class="src">行业观察 2025</div>
  </div>
</div>

<h3>6.2 爽玩版验证的三个行业命题</h3>
<ol>
  <li style="margin-bottom: 14px; padding: 14px 18px; background: #fef2f2; border-left: 4px solid #c0392b; border-radius: 0 8px 8px 0;">
    <strong style="color:#c0392b">命题一：SLG的魅力核心是"策略博弈"，而非"养成碾压"</strong><br>
    <span style="color:#555;font-size:12.5px;line-height:1.8;">爽玩版移除付费碾压后，玩家满意度反而更高，用户生态更健康——这说明"氪金差距"在SLG中不是增强乐趣的元素，而是长期阻碍扩圈的负担。策略博弈感、阵容创意和联盟协作才是核心魅力所在。</span>
  </li>
  <li style="margin-bottom: 14px; padding: 14px 18px; background: #eff6ff; border-left: 4px solid #1d4ed8; border-radius: 0 8px 8px 0;">
    <strong style="color:#1d4ed8">命题二：SLG可以"复杂而不复杂化"——减负不等于降维</strong><br>
    <span style="color:#555;font-size:12.5px;line-height:1.8;">移除天气、宝物等边缘系统后，核心战略博弈反而更清晰，新手上手速度大幅提升，但老玩家的策略深度体验并未损失。这说明SLG的"复杂度"往往来自历史遗留的冗余设计，而非核心体验的必要组成。</span>
  </li>
  <li style="margin-bottom: 0; padding: 14px 18px; background: #f0fdf4; border-left: 4px solid #16a34a; border-radius: 0 8px 8px 0;">
    <strong style="color:#16a34a">命题三：IP老化不是产品生命周期的终点，而是重新设计的机会</strong><br>
    <span style="color:#555;font-size:12.5px;line-height:1.8;">率土10年后通过爽玩版实现声量翻倍、下载历史新高，证明对于有深厚情感积累的IP，"大刀阔斧的机制革新"比"小修小补的内容更新"更能激活生命力。这对拥有历史存量的游戏厂商具有普遍意义。</span>
  </li>
</ol>

<!-- 第七章：对我司的启示 -->
<div class="pb"></div>
<h2 class="sec"><span class="n">7</span>对我司产品的战略启示</h2>

<h3>7.1 设计层面：可直接借鉴的机制清单</h3>
<table>
  <tr><th>爽玩版机制</th><th>核心价值</th><th>适用我司场景</th><th>优先级</th></tr>
  <tr>
    <td><strong>免费抽卡（铜钱系统）</strong></td>
    <td>彻底消除"氪金壁垒"，释放被压制的策略乐趣</td>
    <td>SLG新服开荒期免费武将/英雄获取机制</td>
    <td class="g">⭐⭐⭐⭐⭐ 高优先</td>
  </tr>
  <tr>
    <td><strong>资源产出翻倍</strong></td>
    <td>压缩无意义等待期，加速进入核心玩法阶段</td>
    <td>新手期/赛季初期加速资源产出</td>
    <td class="g">⭐⭐⭐⭐⭐ 高优先</td>
  </tr>
  <tr>
    <td><strong>自动攻城功能</strong></td>
    <td>解除24小时时间绑定，保障玩家生活质量</td>
    <td>定时任务、日常征战自动化功能</td>
    <td class="g">⭐⭐⭐⭐ 重要</td>
  </tr>
  <tr>
    <td><strong>赛季约2个月 + 重置</strong></td>
    <td>降低历史积累差距，定期制造回流节点</td>
    <td>赛季制产品的周期和重置机制设计</td>
    <td class="m">⭐⭐⭐⭐ 重要</td>
  </tr>
  <tr>
    <td><strong>系统精简（移除边缘系统）</strong></td>
    <td>降低新手认知负担，突出核心体验</td>
    <td>产品首发版本功能取舍，MVP聚焦核心玩法</td>
    <td class="g">⭐⭐⭐⭐⭐ 高优先</td>
  </tr>
  <tr>
    <td><strong>行军距离全图解除</strong></td>
    <td>提升策略维度，强化大地图战略联动感</td>
    <td>大地图SLG的移动规则设计</td>
    <td class="m">⭐⭐⭐ 酌情</td>
  </tr>
  <tr>
    <td><strong>赏金服现金激励</strong></td>
    <td>用真实奖励驱动竞技热情和传播</td>
    <td>赛季排名激励、竞技活动奖励机制</td>
    <td class="m">⭐⭐⭐ 酌情</td>
  </tr>
</table>

<h3>7.2 商业模式层面：重新思考SLG的变现逻辑</h3>
<div class="grid2">
  <div class="card">
    <div class="big">从"战力付费"</div>
    <div class="label">传统SLG氪金逻辑：付钱=强力武将=碾压优势。极度依赖重度付费用户，付费天花板低且扩圈困难</div>
    <div class="src">旧模式</div>
  </div>
  <div class="card">
    <div class="big">到"体验付费"</div>
    <div class="label">爽玩版逻辑：付钱=更快节奏/更好体验/更多选择，但不能碾压不付费用户。基数大，长尾LTV高</div>
    <div class="src">新范式</div>
  </div>
</div>

<div class="concept">
  <div class="ctag">🎯 关键战略判断：选择用户基数还是选择重度付费深度？</div>
  <p>
    爽玩版的隐含选择是：<strong>放弃部分重度付费用户的极端ARPPU，换取10倍用户基数的广度</strong>。
    这个交换是否合算，取决于我司目标市场的用户付费特征：
    若目标市场为Tier-3（东南亚/拉美），付费用户极稀缺，"体验付费+IAA混变"是必然选择；
    若目标市场为Tier-1（欧美/日韩），高ARPPU用户大量存在，"体验付费+合理IAP层级设计"更合适。
    核心原则：<strong>无论何种市场，都应将"公平竞技感"作为设计红线——玩家接受付费买体验，拒绝付费买胜利。</strong>
  </p>
</div>

<h3>7.3 运营层面：爽玩版值得复用的运营策略</h3>
<ul>
  <li><strong>开荒节投入：</strong>首赛季大力度活动投入（官方1亿元级别），快速建立玩家基数和社群热度，是后续自然增长的基础。新产品上线的"首月冷启动投入"不应吝啬。</li>
  <li><strong>玩家听劝文化：</strong>官方主动征集玩家反馈（"最听劝的策划"成为网络话题），降低玩家与开发者的对立感，将批评者转化为共创者，这种"开放共创"的运营姿态本身就是差异化竞争力。</li>
  <li><strong>内容创作生态：</strong>公平竞技环境天然催生大量策略攻略内容（因为策略有价值），这些UGC内容成为免费的持续传播引擎，抖音4.3亿播放量中大量来自玩家自发创作。</li>
  <li><strong>多平台互通：</strong>微信小程序+手机APP的数据互通，让"随时随地玩"成为可能，同时利用微信社交关系网络实现裂变传播，是触达增量用户的高效渠道。</li>
</ul>

<!-- 结论 -->
<div class="concl">
  <h2>结论与行动建议（优先级排序）</h2>
  <ul>
    <li>
      <strong>【设计红线：将"公平竞技感"写入产品PRD】</strong>
      爽玩版最核心的洞察是：SLG玩家真正在乎的不是"氪金越多越强"，而是"我的策略能被看见"。
      在我司下一款SLG产品的设计阶段，应明确设定"策略胜利权重≥80%"的硬性指标，
      付费仅加速节奏，不改变策略胜负的可能性空间。
    </li>
    <li>
      <strong>【新手期优先：资源翻倍 + 系统最小化 + 快速进入对战】</strong>
      参考爽玩版"10小时进入对战"的节奏设计，将产品首个有效体验节点压缩至当日完成。
      新手期移除所有非必要系统，武将/英雄获取必须让新手在第一天内感受到明显进展，
      否则次日留存将大幅下滑。
    </li>
    <li>
      <strong>【免费获取核心资产：参考铜币抽卡逻辑设计保底系统】</strong>
      为游戏内核心竞争资产（武将/英雄/装备）设计可持续的免费获取路径，
      确保非付费用户在赛季内可以组建具有竞争力的配置。
      付费渠道提供更快获取速度或额外选择，但不能提供非付费无法获取的顶级配置。
    </li>
    <li>
      <strong>【自动化功能作为保留体验的基础设施】</strong>
      日常征战、定时任务的自动化功能，应在产品首发版本中就作为核心功能提供，
      而非后续迭代的"福利"。它决定了产品对现代用户生活方式的适配程度，
      是新用户转化的隐形门槛。
    </li>
    <li>
      <strong>【赛季制 + 重置机制：建立用户回流的结构性保障】</strong>
      2个月左右的赛季周期，每赛季结算后重置，为非活跃用户提供"重新开始不亏损"的回归窗口。
      赛季结算本身是一次用户重激活机会，配合赛季通行证变现，形成可预期的收入节奏。
    </li>
    <li>
      <strong>【IAA补充变现：对非付费用户的注意力资产化】</strong>
      参考本报告IAA分析框架，在爽玩版逻辑基础上，为非付费用户设计合理的激励广告入口
      （资源翻倍、加速次数、额外资源包），将游戏内的"非付费空白区"转化为广告收入，
      同时不损害付费用户和非付费用户的策略竞技体验。
    </li>
  </ul>
</div>

<div class="footer">
  本报告由 POA Master COO AI 助手生成 · 数据来源：网易官方公告、触乐、腾讯新闻、36氪、知乎、巨量指数、TapTap数据、2025H1全球SLG报告、Sensor Tower等公开资料 · 2026-02-28
</div>

</body>
</html>`;
}

async function main() {
  console.log('📊 开始生成《率土之滨爽玩版深度研究报告》...');

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(buildHTML(), { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({
    format: 'A4', printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
  });
  await browser.close();
  console.log(`✅ PDF 生成完成，大小：${(pdf.length / 1024).toFixed(0)} KB`);

  const outPath = path.join(process.cwd(), 'stzb-casual-mode-report.pdf');
  fs.writeFileSync(outPath, Buffer.from(pdf));
  console.log(`💾 本地副本：${outPath}`);

  const chatId = await getConfig('feishu.chatId');
  if (!chatId) { console.error('❌ feishu.chatId 未配置'); process.exit(1); }

  console.log('📤 上传至飞书...');
  const token = await getTenantToken();
  const fileName = `率土之滨爽玩版深度研究报告-${new Date().toISOString().slice(0, 10)}.pdf`;
  const fileKey = await uploadPDF(Buffer.from(pdf), fileName, token);
  console.log(`✅ 上传成功，file_key: ${fileKey}`);

  await sendFileMsg(chatId, fileKey, token);
  console.log('🎉 报告已发送至飞书！');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('❌', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
