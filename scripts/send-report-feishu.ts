/**
 * 生成《疯狂水世界》SLG资产循环调研报告并通过飞书发送
 *
 * 运行方式：npx tsx scripts/send-report-feishu.ts
 */

import puppeteer from 'puppeteer';
import { PrismaClient } from '@prisma/client';
import { createDecipheriv } from 'crypto';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient();

// ─── 解密工具 ─────────────────────────────────────────────────────────────────

function decrypt(encryptedText: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return encryptedText;
  const parts = encryptedText.split(':');
  if (parts.length !== 3) return encryptedText;
  const key = Buffer.from(secret.padEnd(32, '0').slice(0, 32));
  const [ivHex, tagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function getConfig(key: string): Promise<string> {
  const cfg = await prisma.config.findUnique({ where: { key } });
  if (!cfg?.value) return '';
  return decrypt(cfg.value);
}

// ─── 飞书 API ────────────────────────────────────────────────────────────────

async function getTenantToken(): Promise<string> {
  const appId = await getConfig('feishu.appId');
  const appSecret = await getConfig('feishu.appSecret');
  if (!appId || !appSecret) throw new Error('飞书 App ID/Secret 未配置');

  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data: any = await res.json();
  if (data.code !== 0) throw new Error(`获取Token失败: ${data.msg}`);
  return data.tenant_access_token;
}

async function uploadFile(buffer: Buffer, fileName: string, token: string): Promise<string> {
  const formData = new FormData();
  formData.append('file_type', 'pdf');
  formData.append('file_name', fileName);
  formData.append('file', new Blob([buffer], { type: 'application/pdf' }), fileName);

  const res = await fetch('https://open.feishu.cn/open-apis/im/v1/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const data: any = await res.json();
  if (data.code !== 0) throw new Error(`上传文件失败: ${data.msg}`);
  return data.data.file_key;
}

async function sendFile(chatId: string, fileKey: string, token: string): Promise<void> {
  const res = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: 'file',
      content: JSON.stringify({ file_key: fileKey }),
    }),
  });
  const data: any = await res.json();
  if (data.code !== 0) throw new Error(`发送消息失败: ${data.msg}`);
}

// ─── 报告 HTML ────────────────────────────────────────────────────────────────

function buildReportHTML(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>疯狂水世界：轻量SLG"只增不减"资产循环调研报告</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    font-size: 13px;
    line-height: 1.7;
    color: #1a1a2e;
    background: #ffffff;
    padding: 48px 56px;
  }
  .cover {
    text-align: center;
    padding: 60px 0 48px;
    border-bottom: 3px solid #0056d2;
    margin-bottom: 40px;
  }
  .cover .tag {
    display: inline-block;
    background: #0056d2;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1px;
    padding: 4px 14px;
    border-radius: 20px;
    margin-bottom: 18px;
  }
  .cover h1 {
    font-size: 26px;
    font-weight: 700;
    line-height: 1.4;
    color: #0a0a1a;
    margin-bottom: 14px;
  }
  .cover .subtitle {
    font-size: 14px;
    color: #555;
    margin-bottom: 24px;
  }
  .cover .meta {
    font-size: 12px;
    color: #888;
  }
  .exec-summary {
    background: linear-gradient(135deg, #eff6ff 0%, #e8f0fe 100%);
    border-left: 4px solid #0056d2;
    border-radius: 0 8px 8px 0;
    padding: 20px 24px;
    margin-bottom: 36px;
  }
  .exec-summary h2 { font-size: 14px; color: #0056d2; margin-bottom: 10px; font-weight: 700; }
  .exec-summary p { font-size: 13px; color: #333; line-height: 1.8; }
  h2.section-title {
    font-size: 17px;
    font-weight: 700;
    color: #0a0a1a;
    padding-bottom: 8px;
    border-bottom: 2px solid #e0e8ff;
    margin: 36px 0 16px;
  }
  h2.section-title span.num {
    display: inline-block;
    width: 26px; height: 26px;
    background: #0056d2;
    color: #fff;
    border-radius: 50%;
    font-size: 13px;
    line-height: 26px;
    text-align: center;
    margin-right: 10px;
    vertical-align: middle;
  }
  h3 {
    font-size: 14px;
    font-weight: 700;
    color: #1a3a6a;
    margin: 20px 0 10px;
  }
  p { margin-bottom: 10px; color: #333; }
  ul, ol { padding-left: 20px; margin-bottom: 12px; }
  li { margin-bottom: 6px; color: #333; }
  .highlight-box {
    background: #fff8e1;
    border: 1px solid #ffd54f;
    border-radius: 8px;
    padding: 16px 20px;
    margin: 16px 0;
  }
  .highlight-box .label {
    font-size: 11px;
    font-weight: 700;
    color: #f57f17;
    letter-spacing: 1px;
    margin-bottom: 8px;
  }
  .highlight-box p { color: #444; margin: 0; }
  .data-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin: 16px 0;
  }
  .data-card {
    background: #f8faff;
    border: 1px solid #d0deff;
    border-radius: 8px;
    padding: 16px;
  }
  .data-card .num {
    font-size: 28px;
    font-weight: 700;
    color: #0056d2;
    line-height: 1.2;
  }
  .data-card .desc {
    font-size: 12px;
    color: #666;
    margin-top: 4px;
  }
  .comparison-table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
    font-size: 12px;
  }
  .comparison-table th {
    background: #0056d2;
    color: #fff;
    padding: 10px 14px;
    text-align: left;
    font-weight: 600;
  }
  .comparison-table th:first-child { border-radius: 8px 0 0 0; }
  .comparison-table th:last-child { border-radius: 0 8px 0 0; }
  .comparison-table td {
    padding: 9px 14px;
    border-bottom: 1px solid #eee;
    vertical-align: top;
  }
  .comparison-table tr:nth-child(even) td { background: #f8faff; }
  .tag-good { color: #1b7b34; font-weight: 600; }
  .tag-risk { color: #c0392b; font-weight: 600; }
  .tag-neutral { color: #7f8c8d; }
  .flow-diagram {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    margin: 20px 0;
    flex-wrap: wrap;
  }
  .flow-box {
    background: #e8f0fe;
    border: 2px solid #0056d2;
    border-radius: 8px;
    padding: 12px 16px;
    text-align: center;
    min-width: 100px;
    font-size: 12px;
    font-weight: 600;
    color: #0a2a6a;
  }
  .flow-arrow {
    font-size: 20px;
    color: #0056d2;
    margin: 0 8px;
    font-weight: 700;
  }
  .flow-cycle-arrow {
    display: block;
    text-align: center;
    font-size: 12px;
    color: #0056d2;
    margin: 4px 0 0;
  }
  .conclusion-box {
    background: #0056d2;
    color: #fff;
    border-radius: 10px;
    padding: 28px 32px;
    margin-top: 36px;
  }
  .conclusion-box h2 { font-size: 16px; margin-bottom: 14px; color: #fff; border: none; }
  .conclusion-box ul { padding-left: 20px; }
  .conclusion-box li { margin-bottom: 8px; color: #dce9ff; line-height: 1.7; }
  .footer {
    margin-top: 40px;
    padding-top: 16px;
    border-top: 1px solid #eee;
    font-size: 11px;
    color: #aaa;
    text-align: center;
  }
  .page-break { page-break-before: always; }
</style>
</head>
<body>

<!-- 封面 -->
<div class="cover">
  <div class="tag">SLG 赛道深度研究</div>
  <h1>《疯狂水世界》与轻量SLG<br>"只增不减"资产循环范式研究</h1>
  <div class="subtitle">从战斗消耗到投资式成长——重塑体验门槛与留存逻辑的新路径</div>
  <div class="meta">POA Master · 洞察研究 · 2026年2月26日</div>
</div>

<!-- 执行摘要 -->
<div class="exec-summary">
  <h2>执行摘要</h2>
  <p>
    《疯狂水世界》（益世界，2025年12月上线）以"模拟经营+卡牌养成+SLG"的三层架构，在微信小游戏畅销榜迅速跻身TOP10并长期稳守，成为继《指尖无双》后休闲SLG赛道第二个现象级产品。
    其核心创新在于：以<strong>军功货币</strong>构建一套"只增不减"的资产循环系统，
    将传统SLG中"战斗必然造成兵力/资源损耗"的惩罚机制彻底反转为<strong>投资驱动的正向成长体验</strong>，
    大幅降低新用户的体验门槛，并通过社交粘性与分层付费形成高效留存漏斗。
    本报告深入拆解该设计逻辑、市场意义，并提出对我司产品策略的三项行动建议。
  </p>
</div>

<!-- 第一章 -->
<h2 class="section-title"><span class="num">1</span>市场背景：轻量SLG的崛起</h2>

<h3>1.1 小游戏平台的重度化转型</h3>
<p>
  2025年，国内微信小游戏市场收入达 535 亿元，是 2022 年的 10 倍以上。
  其中 SLG 品类增速尤为突出，同比增长高达 <strong>180%</strong>，远超塔防（80%）和 MMO（75%）。
  微信小游戏从"轻量平台"演变为能够支撑中重度游戏长期运营的基础设施，
  SLG 品类的天花板被普遍认为远未触及。
</p>

<div class="data-grid">
  <div class="data-card">
    <div class="num">535亿</div>
    <div class="desc">2025年微信小游戏市场收入（2022年10倍）</div>
  </div>
  <div class="data-card">
    <div class="num">+180%</div>
    <div class="desc">SLG品类2025年同比增速（全品类最快）</div>
  </div>
  <div class="data-card">
    <div class="num">TOP7</div>
    <div class="desc">《疯狂水世界》微信小游戏畅销榜最高排名</div>
  </div>
  <div class="data-card">
    <div class="num">3亿+</div>
    <div class="desc">2026年微信小游戏内购月活跃用户数</div>
  </div>
</div>

<h3>1.2 传统SLG的用户门槛困境</h3>
<p>
  传统SLG核心体验沿袭"4X框架"——采集、建造、攻城、征服——游戏进程充满<strong>资源损耗焦虑</strong>：
  出兵即意味着兵力消耗、攻城即面临城池被攻、脱机即损失资源。
  这套惩罚机制虽然创造了高竞争浓度，却同时筑起极高的参与门槛，
  大量泛用户（尤其是休闲玩家）在前期受挫后快速流失，
  买量ROI被大幅压缩。
</p>
<p>
  正是在这一背景下，"X + SLG"的融合策略开始系统性兴起。
  《指尖无双》引入弹射玩法，《三国：谋定天下》全面降肝减氪，《无尽冬日》前置模拟经营生态——
  行业正在寻找一种既能保留SLG战略深度，又能大幅降低进入成本的新路径。
</p>

<!-- 第二章 -->
<div class="page-break"></div>
<h2 class="section-title"><span class="num">2</span>产品拆解：疯狂水世界的架构设计</h2>

<h3>2.1 三层漏斗架构</h3>
<p>游戏采用"轻→中→重"的三层玩法漏斗，逐步引导用户从休闲进入核心消费层：</p>

<div class="flow-diagram">
  <div class="flow-box">
    第一层<br>
    <strong>时间管理型<br>模拟经营</strong><br>
    <span style="font-size:11px;font-weight:400;color:#555">（0-5小时，获客锚点）</span>
  </div>
  <div class="flow-arrow">→</div>
  <div class="flow-box">
    第二层<br>
    <strong>休闲SLG<br>大世界争夺</strong><br>
    <span style="font-size:11px;font-weight:400;color:#555">（16级解锁，留存核心）</span>
  </div>
  <div class="flow-arrow">→</div>
  <div class="flow-box">
    第三层<br>
    <strong>卡牌 RPG<br>英雄养成</strong><br>
    <span style="font-size:11px;font-weight:400;color:#555">（深度付费层）</span>
  </div>
</div>

<p>
  <strong>第一层（模拟经营）</strong>：以"采集垃圾→加工资源→建造升级→订单完成"的循环为核心，
  材料分 7 大类，形成复杂网状供需关系，刻意制造"供不应求"的付费压力点。
  同时该阶段的买量创意与模拟经营强关联，大幅降低获客成本——
  模拟经营类素材 CPM 远低于 SLG 品类。
</p>
<p>
  <strong>第二层（SLG）</strong>：玩家以联盟为单位参与赛季制（约18天/赛季）的大世界争夺。
  攻城时间受限（每日1小时），避免高强度碾压；
  资源点设计为"个人专属"，防止联盟内恶性竞争。
</p>
<p>
  <strong>第三层（卡牌养成）</strong>：英雄通过招募获得，最深约需 1600 次招募；
  养成进度直接影响模拟经营生产效率，形成"花钱 → 生产加速 → 更快完成订单 → 更快推进SLG"的付费驱动闭环。
</p>

<h3>2.2 "军功"：核心跨层货币</h3>
<p>
  军功是打通三层架构的关键设计——它并非某一模块的专属货币，而是<strong>全玩法通用的正向积累资产</strong>：
</p>
<ul>
  <li>参与SLG战斗（无论胜负）获得军功</li>
  <li>完成模拟经营订单获得军功</li>
  <li>完成联盟任务、驰援盟友获得军功</li>
  <li>军功可兑换成任意形式的游戏资产（资源、英雄碎片、加速道具）</li>
</ul>
<div class="highlight-box">
  <div class="label">⚡ 核心设计原语</div>
  <p>
    军功系统的本质是将"参与行为"与"资产增长"完全解耦于"胜负结果"——
    玩家在SLG场景中的每一次投入，无论战斗结果如何，
    都必然形成货币化的资产积累，不存在"白打"和"亏本"的心理感知。
  </p>
</div>

<!-- 第三章 -->
<h2 class="section-title"><span class="num">3</span>核心机制：只增不减的资产循环逻辑</h2>

<h3>3.1 传统SLG vs 疯狂水世界：资产流动对比</h3>

<table class="comparison-table">
  <tr>
    <th>维度</th>
    <th>传统SLG</th>
    <th>疯狂水世界</th>
  </tr>
  <tr>
    <td><strong>战斗后资产变化</strong></td>
    <td class="tag-risk">兵力/资源净损耗（赢了也可能亏本）</td>
    <td class="tag-good">军功净增加（战斗 = 投资）</td>
  </tr>
  <tr>
    <td><strong>失败的惩罚感</strong></td>
    <td class="tag-risk">高（资源被掠夺、被迫加速/充值）</td>
    <td class="tag-good">低（军功仍增加，仅进度受影响）</td>
  </tr>
  <tr>
    <td><strong>脱机时的焦虑</strong></td>
    <td class="tag-risk">极高（资源被偷、城池被攻）</td>
    <td class="tag-neutral">中（资源点个人专属，损耗受限）</td>
  </tr>
  <tr>
    <td><strong>新手进入门槛</strong></td>
    <td class="tag-risk">高（容易被碾压，早期流失率高）</td>
    <td class="tag-good">低（漏斗前期为轻量模拟经营）</td>
  </tr>
  <tr>
    <td><strong>付费驱动逻辑</strong></td>
    <td class="tag-neutral">负向驱动（被打痛了充值）</td>
    <td class="tag-good">正向驱动（想成长得更快而充值）</td>
  </tr>
  <tr>
    <td><strong>买量素材类型</strong></td>
    <td class="tag-risk">重SLG（CPM高）</td>
    <td class="tag-good">轻模拟经营+SLG（CPM低）</td>
  </tr>
</table>

<h3>3.2 "投资式成长"的心理学基础</h3>
<p>
  传统SLG的留存机制本质是"损失厌恶"驱动——用户因为害怕失去已有资产而不敢离开。
  这是一种<strong>被动型留存</strong>，依赖持续的焦虑感维持，容易在某次重大失利后导致情绪性流失。
</p>
<p>
  疯狂水世界则转向"成就导向"驱动——用户的每一次参与都在积累可感知的进步，
  形成"今天比昨天强"的<strong>主动型留存</strong>。
  行为经济学视角下，这本质是将游戏内激励从"惩罚回避"转向"奖励积累"，
  用户的情绪曲线更平稳，生命周期更长。
</p>

<div class="highlight-box">
  <div class="label">⚠️ 隐性付费压力</div>
  <p>
    "只增不减"并不意味着无付费压力——设计的精妙之处在于，
    非付费玩家虽然资产持续增长，但<strong>增速慢于付费玩家</strong>。
    在联盟竞争场景中，"相对落后即为退步"的相对剥夺感悄然形成付费转化压力，
    但这种压力来自"想要更快"而非"害怕失去"，心理感受本质不同。
  </p>
</div>

<h3>3.3 双向赋能的闭环飞轮</h3>
<div class="flow-diagram" style="flex-direction:column; gap:4px;">
  <div style="display:flex; align-items:center; gap:0;">
    <div class="flow-box">模拟经营产出</div>
    <div class="flow-arrow">→</div>
    <div class="flow-box">支撑SLG玩法<br>（联盟建设/驰援）</div>
    <div class="flow-arrow">→</div>
    <div class="flow-box">获得军功</div>
  </div>
  <div style="text-align:center; font-size:18px; color:#0056d2; margin: 2px 0;">↕</div>
  <div style="display:flex; align-items:center; gap:0; flex-direction:row-reverse;">
    <div class="flow-box">英雄养成升级</div>
    <div class="flow-arrow">←</div>
    <div class="flow-box">军功兑换资产</div>
    <div class="flow-arrow">←</div>
    <div class="flow-box">攻占绿洲/赛季奖励</div>
  </div>
  <div style="text-align:center; font-size:18px; color:#0056d2; margin: 2px 0;">↓</div>
  <div class="flow-box" style="background:#e0f7fa; border-color:#00838f; color:#004d58;">提升生产效率 → 加速模拟经营循环</div>
</div>

<!-- 第四章 -->
<div class="page-break"></div>
<h2 class="section-title"><span class="num">4</span>留存与商业化逻辑</h2>

<h3>4.1 用户分层留存设计</h3>
<p>游戏针对不同付费意愿的玩家设计了精细的留存层级：</p>
<ul>
  <li>
    <strong>零氪玩家</strong>：通过时间投入积累军功，进度慢但有成就感，属于联盟基础生态贡献者
  </li>
  <li>
    <strong>中低氪玩家</strong>：享受联盟共享奖励分红，感受到超出投入的回报感，付费意愿持续被激活
  </li>
  <li>
    <strong>高氪玩家</strong>：通过英雄养成碾压进度，实现联盟核心位置（盟主/副盟主）的社交资本变现
  </li>
</ul>

<h3>4.2 社交粘性放大器</h3>
<p>
  联盟机制将个人成长与集体利益深度绑定：
  盟主和副盟主获得远超普通成员的资源回报，激励高付费玩家在联盟内持续投入并拉动盟友活跃；
  募捐机制（向联盟贡献资源换取积分）强化了"互利"而非"零和"的社区生态，
  有效降低了用户因战斗失利而流失的风险。
</p>

<h3>4.3 买量-留存-变现的完整飞轮</h3>
<table class="comparison-table">
  <tr>
    <th>阶段</th>
    <th>机制</th>
    <th>效果</th>
  </tr>
  <tr>
    <td><strong>获客期</strong></td>
    <td>模拟经营素材投放（低CPM）</td>
    <td>用同等预算获取更多用户</td>
  </tr>
  <tr>
    <td><strong>早期留存</strong></td>
    <td>轻量上手 + 零损耗军功设计</td>
    <td>降低 Day1-Day7 流失率</td>
  </tr>
  <tr>
    <td><strong>中期留存</strong></td>
    <td>联盟社交 + 赛季竞争节奏</td>
    <td>提升 Day30+ 活跃率</td>
  </tr>
  <tr>
    <td><strong>付费转化</strong></td>
    <td>相对速度差异 + 英雄养成深度</td>
    <td>从"休闲"用户中培育中付费群体</td>
  </tr>
  <tr>
    <td><strong>长期变现</strong></td>
    <td>赛季制重置 + 持续内容更新</td>
    <td>避免资产通胀，维持付费动力</td>
  </tr>
</table>

<!-- 第五章 -->
<h2 class="section-title"><span class="num">5</span>行业影响：SLG范式迁移的深层信号</h2>

<h3>5.1 竞品普遍承压的窗口期</h3>
<p>
  当前传统SLG头部产品（含多款出海产品）正承受来自广告投放合规化与用户体验问题的双重压力。
  微信小游戏平台的轻量SLG成为重要的"流量承接池"——
  用户在重度SLG中因疲惫或失落而流失后，更容易被低门槛的轻量产品捕获。
</p>
<p>
  这意味着：未来6-12个月，<strong>"低广告干扰 + 稳定性 + 赛事治理"</strong>将成为轻量SLG的核心竞争力，
  而非纯粹的付费深度。
</p>

<h3>5.2 "只增不减"设计的边界与风险</h3>
<ul>
  <li>
    <strong>资产通胀风险</strong>：若不配合赛季重置机制，军功积累会导致老玩家与新玩家的进度差越来越大，
    形成护城河后反而阻止新用户留存
  </li>
  <li>
    <strong>竞争浓度稀释</strong>：没有损耗焦虑的战斗可能导致高付费用户满足感下降，
    中后期LTV被压缩
  </li>
  <li>
    <strong>模拟经营复杂度</strong>：当前设计被批评"供应链太复杂、摸索成本高"，
    前期流失点可能集中在经营层而非SLG层
  </li>
</ul>

<h3>5.3 设计公式的可迁移性</h3>
<p>
  疯狂水世界的"只增不减"逻辑本质上是一套<strong>心理账户重构策略</strong>，可迁移至：
</p>
<ul>
  <li>体育/赛事题材：参赛积分只增不减，胜负影响排名不影响积分底盘</li>
  <li>放置类游戏：将挂机收益货币化，离线时间转化为可见资产而非"白耗"</li>
  <li>社交博弈类：将每次互动行为都赋予正向反馈，解除"输了等于亏了"的心理诅咒</li>
</ul>

<!-- 结论与建议 -->
<div class="conclusion-box">
  <h2>结论与对我司产品策略的三项建议</h2>
  <ul>
    <li>
      <strong>【核心洞察】</strong> "只增不减"不是放弃竞争深度，而是<strong>将竞争压力从"惩罚回避"重构为"成长竞速"</strong>。
      这是留存逻辑上的范式升级，而非玩法的简化。
    </li>
    <li>
      <strong>【建议一：审视现有产品的"负向留存"比例】</strong>
      评估当前产品中有多少留存是基于"怕失去"而非"想得到"驱动的。
      若负向留存占比过高，产品抗风险能力弱，一旦用户情绪崩溃将出现断崖流失。
    </li>
    <li>
      <strong>【建议二：在下一个SLG/策略产品中引入"参与即积累"货币】</strong>
      参考军功模型，设计一种与胜负解耦的跨模块正向货币，将新用户的所有参与行为都转化为可感知的成长轨迹，
      重点降低 Day7 流失率。
    </li>
    <li>
      <strong>【建议三：把握竞品承压窗口期】</strong>
      在SLG竞品普遍因"高氪伤害"和"广告合规"承压的6-12个月窗口内，
      通过"低干扰体验 + 稳定服务"快速积累品牌口碑，
      承接从重度SLG流失的中高价值用户群体。
    </li>
  </ul>
</div>

<div class="footer">
  本报告由 POA Master COO AI 助手生成 · 数据来源：搜狐、腾讯新闻、新浪财经、163、GameRes 等公开资料 · 2026-02-26
</div>

</body>
</html>`;
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('📊 开始生成调研报告...');

  // 1. 生成 PDF
  const html = buildReportHTML();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
  });
  await browser.close();
  console.log(`✅ PDF 生成完成，大小：${(pdfBuffer.length / 1024).toFixed(0)} KB`);

  // 可选：保存本地副本
  const outPath = path.join(process.cwd(), 'crazy-water-world-report.pdf');
  fs.writeFileSync(outPath, pdfBuffer);
  console.log(`💾 本地副本保存至：${outPath}`);

  // 2. 获取飞书配置
  const chatId = await getConfig('feishu.chatId');
  if (!chatId) {
    console.error('❌ 未找到飞书群聊 ID (feishu.chatId)，请在系统设置中配置');
    process.exit(1);
  }

  // 3. 上传并发送
  console.log('📤 正在上传至飞书...');
  const token = await getTenantToken();
  const fileName = `疯狂水世界-SLG资产循环调研报告-${new Date().toISOString().slice(0, 10)}.pdf`;
  const fileKey = await uploadFile(Buffer.from(pdfBuffer), fileName, token);
  console.log(`✅ 文件上传成功，file_key: ${fileKey}`);

  await sendFile(chatId, fileKey, token);
  console.log('🎉 调研报告已成功发送至飞书群聊！');

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('❌ 错误：', err.message);
  await prisma.$disconnect();
  process.exit(1);
});
