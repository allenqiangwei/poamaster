/**
 * 生成《SLG游戏IAA+IAP混合变现调研报告》并通过飞书发送
 * 运行方式：npx tsx scripts/send-slg-iaa-report-feishu.ts
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
<title>SLG游戏IAA+IAP混合变现深度调研报告 2026</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;font-size:13px;line-height:1.8;color:#1a1a2e;background:#fff;padding:48px 56px}

/* 封面 */
.cover{text-align:center;padding:60px 0 50px;border-bottom:3px solid #b45309;margin-bottom:42px}
.cover .badge{display:inline-block;background:#b45309;color:#fff;font-size:11px;font-weight:700;letter-spacing:1.5px;padding:4px 18px;border-radius:20px;margin-bottom:18px}
.cover h1{font-size:27px;font-weight:800;line-height:1.4;color:#1c0a00;margin-bottom:12px}
.cover .sub{font-size:13px;color:#666;margin-bottom:20px;line-height:1.9}
.cover .meta{font-size:11px;color:#aaa}

/* 执行摘要 */
.exec{background:linear-gradient(135deg,#fffbeb,#fef3c7);border-left:4px solid #b45309;border-radius:0 10px 10px 0;padding:22px 28px;margin-bottom:38px}
.exec h2{font-size:13px;font-weight:800;color:#b45309;margin-bottom:10px;letter-spacing:.5px}
.exec p{color:#333;font-size:13px;line-height:1.85}

/* 章节标题 */
h2.sec{font-size:17px;font-weight:800;color:#1c0a00;padding-bottom:8px;border-bottom:2px solid #fde68a;margin:38px 0 16px}
h2.sec .n{display:inline-block;width:27px;height:27px;background:#b45309;color:#fff;border-radius:50%;font-size:12px;line-height:27px;text-align:center;margin-right:10px;vertical-align:middle}
h3{font-size:14px;font-weight:700;color:#92400e;margin:20px 0 9px}
p{margin-bottom:10px;color:#333}
ul,ol{padding-left:20px;margin-bottom:12px}
li{margin-bottom:7px;color:#333}

/* 数据卡片 */
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:16px 0}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:16px 0}
.grid4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin:16px 0}
.card{background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:16px}
.card .big{font-size:28px;font-weight:800;color:#b45309;line-height:1.1}
.card .label{font-size:11px;color:#555;margin-top:5px;line-height:1.5}
.card .src{font-size:10px;color:#aaa;margin-top:3px}

/* 广告位卡片 */
.adslot-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:16px 0}
.adslot{border-radius:10px;overflow:hidden;border:1px solid #e5e7eb}
.adslot .head{padding:10px 14px;font-size:12px;font-weight:700;display:flex;align-items:center;gap:8px}
.adslot .head .icon{font-size:16px}
.adslot .body{padding:14px;background:#fff;font-size:12px}
.adslot .body .trigger{color:#666;margin-bottom:6px}
.adslot .body .reward{font-weight:700;color:#1a1a2e;margin-bottom:6px}
.adslot .body .note{font-size:11px;color:#888;font-style:italic}
.slot-a{background:#dbeafe}.slot-a .head{background:#1d4ed8;color:#fff}
.slot-b{background:#dcfce7}.slot-b .head{background:#15803d;color:#fff}
.slot-c{background:#fce7f3}.slot-c .head{background:#9d174d;color:#fff}
.slot-d{background:#ede9fe}.slot-d .head{background:#6d28d9;color:#fff}
.slot-e{background:#ffedd5}.slot-e .head{background:#c2410c;color:#fff}
.slot-f{background:#f0fdf4}.slot-f .head{background:#166534;color:#fff}

/* 概念框 */
.concept{background:#fef3c7;border:1.5px solid #fbbf24;border-radius:10px;padding:18px 22px;margin:16px 0}
.concept .ctag{font-size:11px;font-weight:800;color:#92400e;letter-spacing:1px;margin-bottom:9px}
.concept p{color:#444;margin:0;font-size:13px}

.info{background:#eff6ff;border:1px solid #bfdbfe;border-radius:9px;padding:15px 19px;margin:13px 0}
.info .itag{font-size:11px;font-weight:800;color:#1e40af;letter-spacing:1px;margin-bottom:7px}
.info p{color:#1e3a5f;margin:0}

.warn{background:#fff7ed;border:1px solid #fed7aa;border-radius:9px;padding:15px 19px;margin:13px 0}
.warn .wtag{font-size:11px;font-weight:800;color:#9a3412;letter-spacing:1px;margin-bottom:7px}
.warn p{color:#444;margin:0}

/* 案例框 */
.case{border:2px solid #b45309;border-radius:12px;overflow:hidden;margin:16px 0}
.case .case-head{background:#b45309;color:#fff;padding:12px 18px;font-size:13px;font-weight:700;display:flex;justify-content:space-between;align-items:center}
.case .case-head .tag{font-size:10px;background:rgba(255,255,255,.2);padding:2px 8px;border-radius:10px;font-weight:500}
.case .case-body{padding:16px 18px;background:#fffbeb}
.case .case-body p{margin-bottom:8px;font-size:12.5px}
.case .case-body ul{font-size:12.5px}
.case .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px}
.case .stat{background:#fff;border-radius:8px;padding:10px;text-align:center;border:1px solid #fcd34d}
.case .stat .sv{font-size:20px;font-weight:800;color:#b45309}
.case .stat .sl{font-size:10px;color:#666;margin-top:3px}

/* 表格 */
table{width:100%;border-collapse:collapse;margin:14px 0;font-size:12px}
th{background:#b45309;color:#fff;padding:10px 13px;text-align:left;font-weight:700}
th:first-child{border-radius:8px 0 0 0}th:last-child{border-radius:0 8px 0 0}
td{padding:9px 13px;border-bottom:1px solid #eee;vertical-align:top}
tr:nth-child(even) td{background:#fffbeb}
.g{color:#15803d;font-weight:700}.r{color:#b91c1c;font-weight:700}.m{color:#7c3aed;font-weight:700}
.y{color:#b45309;font-weight:700}

/* 漏斗图 */
.funnel{margin:18px 0}
.funnel-step{display:flex;align-items:center;gap:12px;margin-bottom:6px}
.funnel-bar{height:38px;border-radius:6px;display:flex;align-items:center;padding:0 14px;font-size:12px;font-weight:700;color:#fff;transition:width .3s}
.funnel-label{font-size:11px;color:#666;white-space:nowrap;width:100px;text-align:right}
.funnel-value{font-size:11px;color:#999;margin-left:8px;white-space:nowrap}

/* 矩阵 */
.matrix{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin:14px 0}
.matrix-cell{padding:16px;border-right:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb}
.matrix-cell:nth-child(2n){border-right:none}
.matrix-cell:nth-last-child(-n+2){border-bottom:none}
.matrix-cell .mh{font-size:11px;font-weight:800;color:#b45309;margin-bottom:8px}
.matrix-cell ul{font-size:12px;padding-left:16px}
.matrix-cell li{margin-bottom:4px;color:#444}

/* 结论 */
.concl{background:linear-gradient(135deg,#92400e,#b45309);color:#fff;border-radius:12px;padding:30px 34px;margin-top:36px}
.concl h2{font-size:16px;color:#fff;margin-bottom:14px}
.concl li{color:#fef3c7;margin-bottom:9px;line-height:1.8}
.concl strong{color:#fff}

.footer{margin-top:40px;padding-top:14px;border-top:1px solid #eee;font-size:11px;color:#bbb;text-align:center}
.pb{page-break-before:always}
</style>
</head>
<body>

<!-- 封面 -->
<div class="cover">
  <div class="badge">游戏变现深度研究 · 2026</div>
  <h1>SLG游戏 IAA + IAP 混合变现<br>深度调研报告</h1>
  <div class="sub">
    IAA在SLG中的实际应用场景 · 6类广告位机制拆解 · 头部产品案例<br>
    混变对IAP的影响数据 · 国内外市场差异 · 设计原则与行动建议
  </div>
  <div class="meta">POA Master · 洞察研究部 · 2026年2月27日（含最新网络数据更新）</div>
</div>

<!-- 执行摘要 -->
<div class="exec">
  <h2>执行摘要</h2>
  <p>
    IAA（应用内广告）在SLG游戏中的应用已从"补充收入"升级为"核心变现引擎"。
    <strong>头部SLG中混变产品的流水占比已超80%</strong>，混变渗透率是纯IAP的3倍，
    但其真正的价值不在于"多一个收入来源"，
    而在于<strong>将不愿付费的用户（占DAU的90%以上）的注意力资产化</strong>，
    同时不损害核心付费用户的体验。
    实验数据表明，设计得当的IAA系统可使30日LTV提升20%，付费率和ARPPU完全不受影响。
    <strong>【2025年关键信号】</strong>：全球SLG海外下载量2025年H1达4.9亿次（+10.3%），
    但收入增速停滞——"增量不增收"的结构性矛盾揭示<strong>纯IAP模式已触及天花板</strong>，
    混合变现是穿越天花板的核心工具。本报告深度拆解IAA在SLG中的6类实际触发场景、
    4个头部产品案例（含2025年新黑马《Lands of Jail》）、最新eCPM基准数据、
    2026年微信小游戏新政，并给出可执行的混变广告位设计原则。
  </p>
</div>

<!-- 第一章 -->
<h2 class="sec"><span class="n">1</span>市场全景：SLG混变已成主流</h2>

<h3>1.1 规模数据</h3>
<div class="grid3">
  <div class="card">
    <div class="big">80%+</div>
    <div class="label">头部SLG产品中混变产品的流水占比</div>
    <div class="src">2025年中国小游戏白皮书</div>
  </div>
  <div class="card">
    <div class="big">3x</div>
    <div class="label">混变商业渗透率相比纯IAP的倍数</div>
    <div class="src">腾讯广告混变白皮书 2024</div>
  </div>
  <div class="card">
    <div class="big">+20%</div>
    <div class="label">加入IAA后30日人均LTV提升（《巨兽战场》实验）</div>
    <div class="src">3K游戏×腾讯广告联合实验</div>
  </div>
  <div class="card">
    <div class="big">6x</div>
    <div class="label">激励视频广告对IAP转化的提升倍数上限</div>
    <div class="src">CAS.ai 2025 Hybrid Monetization Report</div>
  </div>
  <div class="card">
    <div class="big">37%</div>
    <div class="label">2024年混合变现游戏收入增速（全品类最快）</div>
    <div class="src">Adjust Hybrid Monetization Report</div>
  </div>
  <div class="card">
    <div class="big">0影响</div>
    <div class="label">设计合理的IAA对付费率和付费ARPPU的影响</div>
    <div class="src">《巨兽战场》A/B实验验证</div>
  </div>
</div>

<div class="grid4">
  <div class="card">
    <div class="big">43%</div>
    <div class="label">2024年全球手游中采用混合变现（IAA+IAP）模式的比例</div>
    <div class="src">PocketGamer 2024行业调查</div>
  </div>
  <div class="card">
    <div class="big">4.5x</div>
    <div class="label">接触过激励广告的用户相比未接触者IAP转化率提升倍数</div>
    <div class="src">AppSamurai Hybrid Monetization 2025</div>
  </div>
  <div class="card">
    <div class="big">95%+</div>
    <div class="label">激励视频全球平均完播率（主动触发场景）</div>
    <div class="src">Tenjin Ad Monetization Benchmark 2025</div>
  </div>
  <div class="card">
    <div class="big">78%</div>
    <div class="label">手游用户主动愿意观看激励视频广告的比例</div>
    <div class="src">Business of Apps Rewarded Video 2025</div>
  </div>
</div>

<h3>1.2 为什么SLG特别适合IAA</h3>
<p>
  SLG的核心机制天然为IAA创造了大量"自然等待点"——建筑升级、科技研究、军队训练都有计时等待期，
  玩家在等待中有明确的"以时间换资源"的需求，这与激励视频的"观看→获得价值"模型完美契合。
</p>

<div class="concept">
  <div class="ctag">⚡ 核心设计哲学：让广告成为游戏的一部分</div>
  <p>
    SLG中IAA的设计底线是：<strong>奖励对象必须是"时间类资产"（加速、临时防护、次数），而非"核心付费道具"（高级英雄碎片、氪金货币）</strong>。
    这样广告触达的是"时间充裕但不愿付钱"的非付费用户，
    而不是替代付费用户的IAP消费行为。
    两者实质上是互补关系而非竞争关系。
  </p>
</div>

<!-- 第二章 -->
<div class="pb"></div>
<h2 class="sec"><span class="n">2</span>IAA在SLG中的6类实际触发场景</h2>

<p>以下是经过大量头部SLG产品（含《无尽冬日》《Whiteout Survival》《万国觉醒》《指尖无双》《巨兽战场》）归纳的6类核心广告位机制：</p>

<div class="adslot-grid">

  <!-- 广告位1 -->
  <div class="adslot slot-a">
    <div class="head"><span class="icon">🏗️</span>广告位①：建造/升级加速</div>
    <div class="body">
      <div class="trigger">📍 触发时机：建筑/科技计时倒计时进行中，剩余时间>X分钟</div>
      <div class="reward">🎁 奖励：观看15~30秒广告 → 加速X分钟（通常5~30分钟）</div>
      <p>每日可触发次数：3~5次（不同VIP等级上限不同）</p>
      <div class="note">典型游戏：《无尽冬日》《万国觉醒》《Whiteout Survival》，入口位于建筑升级倒计时UI右下角的"免费加速"按钮</div>
    </div>
  </div>

  <!-- 广告位2 -->
  <div class="adslot slot-b">
    <div class="head"><span class="icon">📦</span>广告位②：每日免费资源包</div>
    <div class="body">
      <div class="trigger">📍 触发时机：主城界面固定入口，每日重置，通常与签到系统并列</div>
      <div class="reward">🎁 奖励：观看广告 → 领取资源包（木材/粮食/金币等基础资源）</div>
      <p>每日可领取次数：3~8次，奖励量约为普通日常任务的10%~20%</p>
      <div class="note">典型设计：资源量刻意设计为"有用但不足以改变战局"，激发用户多次返回→提升DAU</div>
    </div>
  </div>

  <!-- 广告位3 -->
  <div class="adslot slot-c">
    <div class="head"><span class="icon">⚔️</span>广告位③：战败复活/兵力补充</div>
    <div class="body">
      <div class="trigger">📍 触发时机：战斗失败结算页 / 出征前兵力不足提示</div>
      <div class="reward">🎁 奖励：观看广告 → 复活部分兵力 或 获得一次"免费复战"机会</div>
      <p>每日可触发次数：1~3次（通常首次失败才触发，防止无限复活破坏平衡）</p>
      <div class="note">风险点：需严格限制次数，否则高强度战斗的付费压力（医疗/兵力购买）会被广告完全替代</div>
    </div>
  </div>

  <!-- 广告位4 -->
  <div class="adslot slot-d">
    <div class="head"><span class="icon">🛡️</span>广告位④：短效防护罩</div>
    <div class="body">
      <div class="trigger">📍 触发时机：防护罩即将到期提醒 / 被攻击后UI弹出</div>
      <div class="reward">🎁 奖励：观看广告 → 获得1~4小时临时防护</div>
      <p>每日可触发次数：1~2次（长效防护罩仍须IAP购买，广告罩仅覆盖脱机保护场景）</p>
      <div class="note">典型游戏：《末日战争》《State of Survival》，广告罩入口在防护状态栏底部，区别于付费罩的高亮显示</div>
    </div>
  </div>

  <!-- 广告位5 -->
  <div class="adslot slot-e">
    <div class="head"><span class="icon">🔥</span>广告位⑤：奖励倍增器</div>
    <div class="body">
      <div class="trigger">📍 触发时机：日常任务完成结算页 / 脱机收益领取弹窗</div>
      <div class="reward">🎁 奖励：观看广告 → 本次任务奖励×2 或 脱机收益翻倍（1~2小时）</div>
      <p>每日可触发次数：3~5次，通常在每个任务/收益领取时各触发1次</p>
      <div class="note">设计精妙：让用户主动寻找广告触发点→大幅提升广告展示率，同时奖励感知价值高（"我赚到了"）</div>
    </div>
  </div>

  <!-- 广告位6 -->
  <div class="adslot slot-f">
    <div class="head"><span class="icon">🎰</span>广告位⑥：宝箱/招募额外机会</div>
    <div class="body">
      <div class="trigger">📍 触发时机：免费招募冷却中 / 宝箱开启后的"再开一次"弹窗</div>
      <div class="reward">🎁 奖励：观看广告 → 重置免费招募冷却 / 或获得一次低级招募机会</div>
      <p>每日可触发次数：1~3次，奖励档次严格低于付费招募档次</p>
      <div class="note">关键：招募结果只能是低阶卡，保留高阶角色对IAP的稀缺性吸引力</div>
    </div>
  </div>

</div>

<h3>2.1 各广告位的变现价值排序</h3>
<table>
  <tr><th>广告位类型</th><th>用户接受度</th><th>eCPM贡献</th><th>对IAP的影响</th><th>推荐优先级</th></tr>
  <tr>
    <td>⑤ 奖励倍增器</td>
    <td class="g">极高（主动触发）</td>
    <td class="g">高</td>
    <td class="g">无负影响</td>
    <td class="g">⭐⭐⭐⭐⭐ 首选</td>
  </tr>
  <tr>
    <td>② 每日免费资源包</td>
    <td class="g">极高（主动触发）</td>
    <td class="m">中</td>
    <td class="g">无负影响</td>
    <td class="g">⭐⭐⭐⭐⭐ 首选</td>
  </tr>
  <tr>
    <td>① 建造/升级加速</td>
    <td class="g">高</td>
    <td class="g">高（时间价值感知强）</td>
    <td class="g">无影响</td>
    <td class="g">⭐⭐⭐⭐ 必配</td>
  </tr>
  <tr>
    <td>④ 短效防护罩</td>
    <td class="m">中（脱机场景）</td>
    <td class="m">中</td>
    <td class="m">轻微替代付费罩需求</td>
    <td class="m">⭐⭐⭐ 慎重</td>
  </tr>
  <tr>
    <td>⑥ 宝箱额外机会</td>
    <td class="m">中</td>
    <td class="m">中</td>
    <td class="m">低档次设计可规避风险</td>
    <td class="m">⭐⭐⭐ 慎重</td>
  </tr>
  <tr>
    <td>③ 战败复活</td>
    <td class="r">低（战斗中断感强）</td>
    <td class="m">中高（情绪触发）</td>
    <td class="r">过度使用会替代医疗IAP</td>
    <td class="r">⭐⭐ 高风险</td>
  </tr>
</table>

<!-- 第三章 -->
<div class="pb"></div>
<h2 class="sec"><span class="n">3</span>头部产品案例深度拆解</h2>

<!-- 案例1 -->
<div class="case">
  <div class="case-head">
    《Whiteout Survival》（无尽冬日）— 出海SLG混变标杆
    <span class="tag">Century Games · 全球累计收入超20亿美元</span>
  </div>
  <div class="case-body">
    <p><strong>混变架构</strong>：IAP为主（70%~80%收入来自Tier-1市场IAP），IAA集中于非付费用户群体，实现收入的全人群覆盖。</p>
    <p><strong>IAA核心广告位</strong>：</p>
    <ul>
      <li>主城界面"免费礼包"图标（每日3次激励视频，奖励基础资源包）</li>
      <li>建设计时器旁的"免费加速"（每日5次上限，每次加速10~30分钟）</li>
      <li>脱机收益领取后的"2倍离线收益"（每日可激活3次，每次持续2小时）</li>
    </ul>
    <p><strong>广告投放策略</strong>：Playable Ads占总投放55%+，Rewarded Video占14%+，以UA侧的"广告"驱动的安装反哺游戏内IAA的eCPM——两个广告体系形成协同。</p>
    <div class="stats">
      <div class="stat"><div class="sv">$2B+</div><div class="sl">全球累计收入</div></div>
      <div class="stat"><div class="sv">54</div><div class="sl">投放覆盖地区</div></div>
      <div class="stat"><div class="sv">17</div><div class="sl">接入广告平台数量</div></div>
    </div>
  </div>
</div>

<!-- 案例2 -->
<div class="case">
  <div class="case-head">
    《巨兽战场》— 国内SLG混变最完整的实验案例
    <span class="tag">3K游戏 × 腾讯广告 · 微信小游戏SLG</span>
  </div>
  <div class="case-body">
    <p><strong>实验设计</strong>：将用户随机分为"有广告组"和"无广告组"，持续测试30天，精确量化IAA对LTV、付费率、ARPPU的影响。</p>
    <p><strong>广告位选择逻辑</strong>：选择在"每日任务完成"、"战斗胜利结算"两个自然断点插入激励视频，奖励为通用资源而非核心付费货币。</p>
    <p><strong>关键实验结论</strong>：</p>
    <ul>
      <li>30日人均LTV：<strong>有广告组比无广告组高20%</strong></li>
      <li>付费留存：<strong>有广告组提升2个百分点</strong>（广告增加了用户粘性，间接促进了付费转化）</li>
      <li>付费率和付费ARPPU：<strong>两组无显著差异</strong>（IAA不会替代IAP消费）</li>
    </ul>
    <div class="stats">
      <div class="stat"><div class="sv">+20%</div><div class="sl">30日LTV提升</div></div>
      <div class="stat"><div class="sv">+2pct</div><div class="sl">付费留存提升</div></div>
      <div class="stat"><div class="sv">0影响</div><div class="sl">付费率/ARPPU</div></div>
    </div>
  </div>
</div>

<!-- 案例3 -->
<div class="case">
  <div class="case-head">
    《指尖无双》— 轻量SLG混变创新：广告即玩法
    <span class="tag">微信小游戏 · SLG+弹射玩法融合</span>
  </div>
  <div class="case-body">
    <p><strong>创新点</strong>：将IAA与副玩法（弹射关卡）深度融合——弹射关卡本身成为广告入口，
    用户完成弹射关卡可"选择是否观看广告获得更好奖励"，而非打断主线的强插广告。</p>
    <p><strong>IAA触发场景设计</strong>：</p>
    <ul>
      <li>弹射关卡完成后：主动弹出"观看广告获得额外X金币"选项</li>
      <li>联盟宝库贡献：贡献联盟资源后可"看广告再贡献一次"（提升联盟活跃度和粘性）</li>
      <li>每日探索次数：看广告额外获得1次探索机会（核心消耗品）</li>
    </ul>
    <p><strong>数据亮点</strong>：广告触发率（用户主动点击观看广告的比例）显著高于行业平均，因为广告入口嵌入在用户正在进行的操作流中，而非打断体验。</p>
    <div class="stats">
      <div class="stat"><div class="sv">高</div><div class="sl">广告主动触发率</div></div>
      <div class="stat"><div class="sv">融合</div><div class="sl">广告即玩法设计</div></div>
      <div class="stat"><div class="sv">低</div><div class="sl">用户负面反馈率</div></div>
    </div>
  </div>
</div>

<!-- 案例4 -->
<div class="case">
  <div class="case-head">
    《Lands of Jail》— 2025年混变SLG新黑马：模拟经营×4X混血
    <span class="tag">FoxData · 2025年4月收入环比+342%</span>
  </div>
  <div class="case-body">
    <p><strong>产品定位</strong>：将SLG的策略深度与监狱模拟经营的幽默题材融合，核心用户对广告的接受度极高，混变设计的容错空间更大。</p>
    <p><strong>增长驱动因素</strong>：</p>
    <ul>
      <li><strong>题材差异化</strong>：在同质化严重的SLG赛道，高对比度主题（监狱运营）创造天然的UA素材记忆点，广告点击率显著高于传统SLG</li>
      <li><strong>副玩法植入广告</strong>：副玩法（出逃解谜）关卡结算时嵌入"观看广告获得额外奖励"，复现了《指尖无双》的"广告即玩法"逻辑</li>
      <li><strong>快速变现节奏</strong>：新手期更短，广告首次出现时机提前至引导完成后15分钟，适配Tier-3市场（东南亚/拉美）高占比用户特征</li>
    </ul>
    <p><strong>关键结论</strong>：证明"题材创新×副玩法×混变"的三角结构可以在SLG赛道创造独立增长曲线，而不是与头部产品正面竞争。</p>
    <div class="stats">
      <div class="stat"><div class="sv">+342%</div><div class="sl">4月收入环比增速</div></div>
      <div class="stat"><div class="sv">混血</div><div class="sl">模拟经营×4X融合</div></div>
      <div class="stat"><div class="sv">Tier-3</div><div class="sl">主力市场东南亚/拉美</div></div>
    </div>
  </div>
</div>

<!-- 第四章 -->
<h2 class="sec"><span class="n">4</span>广告类型与平台：IAA技术基础</h2>

<h3>4.1 三大广告形式在SLG中的适用性</h3>
<table>
  <tr><th>广告形式</th><th>SLG适用场景</th><th>用户体验</th><th>eCPM水平</th><th>SLG推荐度</th></tr>
  <tr>
    <td><strong>激励视频<br>（Rewarded Video）</strong></td>
    <td>加速/资源/倍增/复活等所有主动触发场景</td>
    <td class="g">极佳（用户自愿）</td>
    <td class="g">最高：美国iOS $19.63、Android $16.49<br>澳洲Android $18.87、日本 $17.35<br>全球Tier-1 $15~30（Q4 2024）</td>
    <td class="g">⭐⭐⭐⭐⭐ 核心</td>
  </tr>
  <tr>
    <td><strong>插屏广告<br>（Interstitial）</strong></td>
    <td>场景切换（主城→战场）/ 日常任务列表加载时</td>
    <td class="m">中（需控制频率）</td>
    <td class="m">中：美国iOS $6~12、Android $5~9<br>Tier-3 $0.5~3</td>
    <td class="m">⭐⭐⭐ 补量</td>
  </tr>
  <tr>
    <td><strong>横幅广告<br>（Banner）</strong></td>
    <td>菜单/商城页面底部常驻</td>
    <td class="r">较差（视觉干扰）</td>
    <td class="r">最低：$0.3~1.5（全球平均）</td>
    <td class="r">⭐⭐ 慎用</td>
  </tr>
</table>

<h3>4.2 主要IAA变现平台与游戏市场匹配</h3>
<table>
  <tr><th>平台</th><th>SLG核心优势</th><th>适用市场</th><th>接入建议</th></tr>
  <tr>
    <td><strong>AdMob（Google）</strong></td>
    <td>全球流量最大，填充率高，支持聚合</td>
    <td>欧美/日韩 Tier-1</td>
    <td class="g">必接，作为基础层</td>
  </tr>
  <tr>
    <td><strong>Meta Audience Network</strong></td>
    <td>社交用户画像精准，Tier-1 eCPM高</td>
    <td>欧美/东南亚</td>
    <td class="g">必接，Tier-1首选补量</td>
  </tr>
  <tr>
    <td><strong>AppLovin MAX（聚合）</strong></td>
    <td>竞价聚合，自动选最高eCPM广告商</td>
    <td>全球</td>
    <td class="g">聚合层首选</td>
  </tr>
  <tr>
    <td><strong>Mintegral（汇量）</strong></td>
    <td>新兴市场覆盖强，游戏行业专注</td>
    <td>东南亚/拉美/中东</td>
    <td class="m">Tier-3市场必接</td>
  </tr>
  <tr>
    <td><strong>微信广告（国内）</strong></td>
    <td>小游戏生态闭环，激励金政策支持</td>
    <td>中国大陆</td>
    <td class="g">国内小游戏必接</td>
  </tr>
</table>

<div class="info">
  <div class="itag">💡 聚合中介（Mediation）是IAA的基础设施</div>
  <p>单接一个广告平台填充率和eCPM都不理想。通过 AppLovin MAX 或 ironSource 聚合多个平台进行实时竞价（In-App Bidding），
  可提升eCPM 20%~40%。SLG项目应在MVP阶段就接入聚合层，而非先接单一平台。</p>
</div>

<!-- 第五章 -->
<div class="pb"></div>
<h2 class="sec"><span class="n">5</span>国内外市场差异：IAA比例怎么定</h2>

<h3>5.1 按市场Tier分层的IAA/IAP比例策略</h3>

<div class="matrix">
  <div class="matrix-cell" style="background:#fff7ed">
    <div class="mh">🇺🇸 Tier-1 美国/日本/西欧</div>
    <ul>
      <li>IAP为主，占收入70%~80%</li>
      <li>IAA为辅，占收入20%~30%</li>
      <li>激励视频eCPM：$15~30</li>
      <li>用户LTV高，应优先推动IAP转化</li>
      <li>广告位数量克制（日均3~5次激励视频）</li>
    </ul>
  </div>
  <div class="matrix-cell" style="background:#f0fdf4">
    <div class="mh">🌏 Tier-2 韩国/台湾/中东</div>
    <ul>
      <li>IAP与IAA并重，各占50%左右</li>
      <li>激励视频eCPM：$5~15</li>
      <li>用户对广告接受度较高</li>
      <li>广告位可适当增加（日均5~8次）</li>
      <li>订阅制（Pass）可作为第三变现层</li>
    </ul>
  </div>
  <div class="matrix-cell" style="background:#eff6ff">
    <div class="mh">🌍 Tier-3 东南亚/印度/拉美</div>
    <ul>
      <li>IAA为主，占收入60%~70%</li>
      <li>IAP极难转化，付费用户稀缺</li>
      <li>激励视频eCPM：$1~5</li>
      <li>广告位数量可较多（日均8~12次）</li>
      <li>靠广告收入覆盖服务器和UA成本</li>
    </ul>
  </div>
  <div class="matrix-cell" style="background:#fdf4ff">
    <div class="mh">🇨🇳 中国微信小游戏（2026年新政）</div>
    <ul>
      <li><strong>激励金上限大幅提升</strong>：单款首发新游激励金上限至400万元（2026-01-01起）</li>
      <li><strong>IAP额外激励</strong>：首发期近30天IAP流水每满200万，额外5%现金激励，不设上限</li>
      <li>IAA月活用户规模：IAA小游戏月活已达4亿</li>
      <li>IAP月活超3亿，SLG品类持续崛起</li>
      <li>平台数据互通+广告平台闭环，是全球最优混变政策环境之一</li>
    </ul>
  </div>
</div>

<h3>5.2 广告频次设计参考基准</h3>
<table>
  <tr><th>指标</th><th>Tier-1市场建议</th><th>Tier-3市场建议</th><th>国内小游戏</th></tr>
  <tr>
    <td>每日激励视频上限</td>
    <td>3~5次</td>
    <td>8~12次</td>
    <td>5~8次（受平台规范约束）</td>
  </tr>
  <tr>
    <td>每日插屏广告上限</td>
    <td>2~3次（仅自然断点）</td>
    <td>5~7次</td>
    <td>3~5次</td>
  </tr>
  <tr>
    <td>横幅广告</td>
    <td class="r">不建议（体验影响大）</td>
    <td class="m">可用于设置/商城等静态页</td>
    <td class="r">不建议</td>
  </tr>
  <tr>
    <td>首次广告出现时机</td>
    <td>新手引导完成后（约30~60分钟）</td>
    <td>新手引导完成后（约15~30分钟）</td>
    <td>第3~5关解锁后</td>
  </tr>
  <tr>
    <td>付费用户广告策略</td>
    <td colspan="3" class="m">建议关闭或大幅减少插屏广告，保留主动触发的激励视频</td>
  </tr>
</table>

<!-- 第六章 -->
<h2 class="sec"><span class="n">6</span>混变设计原则：五条黄金法则</h2>

<ol style="counter-reset: item; list-style: none; padding: 0;">
  <li style="margin-bottom: 16px; padding: 16px 20px; background: #fffbeb; border-left: 4px solid #b45309; border-radius: 0 8px 8px 0;">
    <strong style="color:#b45309; font-size:13px;">法则一：奖励必须是"时间资产"，而非"核心货币"</strong><br>
    <span style="color:#555; font-size:12.5px; line-height:1.8;">广告奖励设定为加速券、临时防护、次数重置，而非宝石/钻石等核心付费货币。
    一旦广告可以直接奖励核心货币，IAP的付费动力就会被稀释。</span>
  </li>
  <li style="margin-bottom: 16px; padding: 16px 20px; background: #f0fdf4; border-left: 4px solid #15803d; border-radius: 0 8px 8px 0;">
    <strong style="color:#15803d; font-size:13px;">法则二：用户主动触发 > 算法强插</strong><br>
    <span style="color:#555; font-size:12.5px; line-height:1.8;">激励视频必须是"用户点击才出现"，而非系统自动弹出。
    主动触发的用户满意度和完播率（>90%）远高于强制插播（<60%），
    高完播率带来更高eCPM，形成正向循环。</span>
  </li>
  <li style="margin-bottom: 16px; padding: 16px 20px; background: #eff6ff; border-left: 4px solid #1d4ed8; border-radius: 0 8px 8px 0;">
    <strong style="color:#1d4ed8; font-size:13px;">法则三：付费用户必须被区别对待</strong><br>
    <span style="color:#555; font-size:12.5px; line-height:1.8;">对累计充值超过阈值的用户，关闭插屏广告并提高激励视频奖励质量。
    付费用户是最核心的ARPPU来源，广告体验的任何负面影响都不值得冒险。</span>
  </li>
  <li style="margin-bottom: 16px; padding: 16px 20px; background: #fdf4ff; border-left: 4px solid #7c3aed; border-radius: 0 8px 8px 0;">
    <strong style="color:#7c3aed; font-size:13px;">法则四：广告位嵌入游戏流，而非打断游戏流</strong><br>
    <span style="color:#555; font-size:12.5px; line-height:1.8;">最佳广告位是用户"正在等待某件事完成"的时刻（建筑倒计时、日常领取）。
    《指尖无双》的实践证明，将广告入口嵌入用户正在进行的操作中，
    触发率和满意度均显著优于单独弹出的广告入口。</span>
  </li>
  <li style="margin-bottom: 0; padding: 16px 20px; background: #fff7ed; border-left: 4px solid #c2410c; border-radius: 0 8px 8px 0;">
    <strong style="color:#c2410c; font-size:13px;">法则五：用数据驱动广告位上下线决策</strong><br>
    <span style="color:#555; font-size:12.5px; line-height:1.8;">每个新广告位上线前需设定"对照实验"：追踪有广告组vs无广告组的D7/D30留存、IAP付费率、ARPPU。
    《巨兽战场》的标准是：任何广告位若使付费率下降，立即下线。</span>
  </li>
</ol>

<!-- 第七章 -->
<div class="pb"></div>
<h2 class="sec"><span class="n">7</span>2026年关键信号：机遇与风险并存</h2>

<h3>7.1 结构性机遇：纯IAP天花板已现，混变窗口期开启</h3>
<div class="info">
  <div class="itag">📈 2025年H1 SLG海外市场数据</div>
  <p>2025年上半年全球SLG手游海外下载量达4.9亿次（同比+10.3%），但收入增速显著停滞——下载量的增长未能转化为对等的收入增长。这一"增量不增收"的结构性矛盾说明，依赖单纯扩大安装量的纯IAP增长模式已接近边界。具备混合变现能力的产品将比纯IAP产品拥有更强的后期LTV抗衰减能力。</p>
</div>

<h3>7.2 平台政策红利：2026年是混变窗口年</h3>
<div class="grid2">
  <div class="card">
    <div class="big">400万</div>
    <div class="label">微信2026年单款首发新游激励金上限（元），首发期IAP流水每200万额外+5%现金激励</div>
    <div class="src">微信小游戏平台政策 2026-01-01</div>
  </div>
  <div class="card">
    <div class="big">+35%</div>
    <div class="label">Township（Playrix）接入激励视频后当月eCPM提升，整体收入增长28%</div>
    <div class="src">AppSamurai Hybrid Monetization Case Study 2025</div>
  </div>
</div>

<h3>7.3 主要风险：AI广告合规硬约束时代来临</h3>
<div class="warn">
  <div class="wtag">⚠️ 风险预警：ROI硬约束 + 素材合规</div>
  <p>2026年广告投放进入"ROI硬约束"时代：各平台对AI生成素材的合规审查趋严，虚假宣传、夸大游戏体验的素材将面临平台下架和广告账户封禁风险。SLG产品的IAA收入来自真实的用户观看行为，而UAC侧的素材合规性将直接影响能拉来什么质量的用户，进而影响游戏内激励广告的接受度和eCPM表现。<strong>IAA变现效率 = 广告位设计质量 × 用户质量（UA侧合规素材决定）</strong>，两者缺一不可。</p>
</div>

<table>
  <tr><th>维度</th><th>核心信号</th><th>对SLG混变的影响</th><th>应对优先级</th></tr>
  <tr>
    <td>平台政策</td>
    <td>微信2026年激励金政策升级</td>
    <td class="g">直接增加混变收入激励，国内优先混变</td>
    <td class="g">⭐⭐⭐⭐⭐ 立即行动</td>
  </tr>
  <tr>
    <td>市场结构</td>
    <td>SLG海外"增量不增收"</td>
    <td class="m">混变可补充LTV，但需防止广告稀释IAP</td>
    <td class="m">⭐⭐⭐⭐ 中期规划</td>
  </tr>
  <tr>
    <td>广告合规</td>
    <td>AI素材审查趋严</td>
    <td class="r">UA质量下降→游戏内广告eCPM下滑→混变收益缩水</td>
    <td class="r">⭐⭐⭐⭐⭐ 风险控制</td>
  </tr>
  <tr>
    <td>用户行为</td>
    <td>78%用户愿意看激励广告</td>
    <td class="g">混变的用户接受度基础扎实，可大胆推进</td>
    <td class="g">⭐⭐⭐ 验证信心</td>
  </tr>
  <tr>
    <td>技术趋势</td>
    <td>In-App Bidding聚合竞价成熟</td>
    <td class="g">直接接入聚合层可提升eCPM 20%~40%，门槛大幅降低</td>
    <td class="g">⭐⭐⭐⭐ 技术选型</td>
  </tr>
</table>

<!-- 结论 -->
<div class="concl">
  <h2>结论：对我司SLG产品的IAA实施建议（2026年优先级版）</h2>
  <ul>
    <li>
      <strong>【第一优先：把握微信2026年激励金政策红利】</strong>
      2026年1月起新政实施——首发期IAP流水每满200万额外5%现金激励，激励金上限400万元。
      国内SLG产品应在首发期内同时推进IAP和IAA，最大化平台激励金叠加收益，窗口期有限。
    </li>
    <li>
      <strong>【第二优先：从两个最安全的广告位开始】</strong>
      "每日免费资源包"（激励视频×3次）和"奖励倍增器"（任务结算后激励视频）是风险最低、用户接受度最高的广告位（78%用户主动愿意观看）。
      建议在下一个SLG产品早期版本中率先接入，其余广告位在数据验证后逐步扩展。
    </li>
    <li>
      <strong>【第三优先：建造/升级加速广告位】</strong>
      SLG的核心机制天然支持这个广告位，玩家有强烈的"缩短等待时间"动机。
      建议每日上限设为5次，每次加速10~30分钟，保留长时间加速对IAP的购买驱动力。
    </li>
    <li>
      <strong>【聚合接入策略（直接上聚合层）】</strong>
      直接接入 AppLovin MAX 聚合层，同时连接 AdMob + Meta Audience Network + Mintegral。
      不要先接单一平台，聚合竞价可提升eCPM 20%~40%。2025年美国iOS激励视频eCPM已达$19.63，
      直接接聚合层相比单接一个平台，每千次展示多收入约$4~8。
    </li>
    <li>
      <strong>【广告合规与素材管控同步进行】</strong>
      IAA收益依赖用户质量，而用户质量取决于UA侧素材合规性。2026年AI素材合规审查趋严，
      建立素材溯源和合规审核流程是保护混变收益稳定性的必要基础设施。
    </li>
    <li>
      <strong>【用实验说话，不用经验判断】</strong>
      参考《巨兽战场》A/B实验方法，每个广告位上线前设定实验组，
      以D30 LTV和IAP付费率为核心指标，数据支持则扩展，数据无效则下线，不做主观决策。
    </li>
  </ul>
</div>

<div class="footer">
  本报告由 POA Master COO AI 助手生成 · 数据来源：腾讯广告混变白皮书、AppGrowing、CAS.ai、Adjust、Sensor Tower、3K游戏×腾讯联合实验、Tenjin Ad Monetization Benchmark 2025、PocketGamer、AppSamurai、Business of Apps、FoxData、微信小游戏平台政策等公开资料 · 2026-02-27
</div>

</body>
</html>`;
}

async function main() {
  console.log('📊 开始生成SLG IAA+IAP调研报告...');

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(buildHTML(), { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({
    format: 'A4', printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
  });
  await browser.close();
  console.log(`✅ PDF 生成完成，大小：${(pdf.length / 1024).toFixed(0)} KB`);

  const outPath = path.join(process.cwd(), 'slg-iaa-iap-report.pdf');
  fs.writeFileSync(outPath, pdf);
  console.log(`💾 本地副本：${outPath}`);

  const chatId = await getConfig('feishu.chatId');
  if (!chatId) { console.error('❌ feishu.chatId 未配置'); process.exit(1); }

  console.log('📤 上传至飞书...');
  const token = await getTenantToken();
  const fileName = `SLG游戏IAA+IAP混合变现调研报告-${new Date().toISOString().slice(0, 10)}.pdf`;
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
