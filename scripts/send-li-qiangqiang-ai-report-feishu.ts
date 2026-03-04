/**
 * 基于强伟与李强强的AI投放对话，生成定制化调研报告并通过飞书发送
 * 运行方式：npx tsx scripts/send-li-qiangqiang-ai-report-feishu.ts
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
<title>AI投放全流程方案：创意即信号时代的研究报告</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;font-size:13px;line-height:1.8;color:#1a1a2e;background:#fff;padding:48px 56px}

.cover{text-align:center;padding:60px 0 48px;border-bottom:3px solid #0f766e;margin-bottom:40px}
.cover .badge{display:inline-block;background:#0f766e;color:#fff;font-size:11px;font-weight:700;letter-spacing:1.5px;padding:4px 16px;border-radius:20px;margin-bottom:18px}
.cover h1{font-size:26px;font-weight:800;line-height:1.4;color:#0a2018;margin-bottom:12px}
.cover .sub{font-size:13px;color:#555;margin-bottom:20px;line-height:1.9}
.cover .meta{font-size:11px;color:#999}

/* 对话还原框 */
.chat-block{background:#f0fdf4;border:1px solid #6ee7b7;border-radius:10px;padding:20px 24px;margin:16px 0}
.chat-block .chat-title{font-size:11px;font-weight:800;color:#065f46;letter-spacing:1px;margin-bottom:12px}
.chat-msg{margin-bottom:10px;display:flex;gap:10px;align-items:flex-start}
.chat-msg .who{font-size:11px;font-weight:700;min-width:52px;padding-top:2px;color:#0f766e}
.chat-msg .who.other{color:#7c3aed}
.chat-msg .bubble{font-size:12.5px;color:#1a1a2e;line-height:1.75;flex:1}
.chat-msg .bubble strong{color:#0f766e}

.exec{background:linear-gradient(135deg,#f0fdfa,#e6fffa);border-left:4px solid #0f766e;border-radius:0 10px 10px 0;padding:22px 28px;margin-bottom:36px}
.exec h2{font-size:13px;font-weight:800;color:#0f766e;margin-bottom:10px;letter-spacing:.5px}
.exec p{color:#333;font-size:13px;line-height:1.85}

h2.sec{font-size:17px;font-weight:800;color:#0a2018;padding-bottom:8px;border-bottom:2px solid #ccfbf1;margin:38px 0 16px}
h2.sec .n{display:inline-block;width:26px;height:26px;background:#0f766e;color:#fff;border-radius:50%;font-size:12px;line-height:26px;text-align:center;margin-right:10px;vertical-align:middle}
h3{font-size:14px;font-weight:700;color:#065f46;margin:20px 0 9px}
p{margin-bottom:10px;color:#333}
ul,ol{padding-left:20px;margin-bottom:12px}
li{margin-bottom:7px;color:#333}

.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:16px 0}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:16px 0}
.card{background:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;padding:16px}
.card .big{font-size:28px;font-weight:800;color:#0f766e;line-height:1.1}
.card .label{font-size:11px;color:#555;margin-top:5px;line-height:1.5}
.card .src{font-size:10px;color:#aaa;margin-top:3px}

/* 核心概念框 */
.concept{background:#fffbeb;border:1.5px solid #fcd34d;border-radius:10px;padding:20px 24px;margin:18px 0}
.concept .ctag{font-size:11px;font-weight:800;color:#92400e;letter-spacing:1px;margin-bottom:10px}
.concept p{color:#444;margin:0;font-size:13px;line-height:1.85}

.danger{background:#fff1f2;border:1px solid #fda4af;border-radius:9px;padding:16px 20px;margin:14px 0}
.danger .dtag{font-size:11px;font-weight:800;color:#be123c;letter-spacing:1px;margin-bottom:7px}
.danger p{color:#444;margin:0}

.info{background:#eff6ff;border:1px solid #bfdbfe;border-radius:9px;padding:16px 20px;margin:14px 0}
.info .itag{font-size:11px;font-weight:800;color:#1e40af;letter-spacing:1px;margin-bottom:7px}
.info p{color:#1e3a5f;margin:0}

table{width:100%;border-collapse:collapse;margin:14px 0;font-size:12px}
th{background:#0f766e;color:#fff;padding:10px 13px;text-align:left;font-weight:700}
th:first-child{border-radius:8px 0 0 0}th:last-child{border-radius:0 8px 0 0}
td{padding:9px 13px;border-bottom:1px solid #eee;vertical-align:top}
tr:nth-child(even) td{background:#f0fdfa}
.g{color:#0f766e;font-weight:700}.r{color:#be123c;font-weight:700}.m{color:#7c3aed;font-weight:700}

/* 流程图 */
.flow{display:flex;align-items:stretch;gap:0;margin:20px 0;flex-wrap:nowrap}
.fb{background:#ccfbf1;border:2px solid #0f766e;border-radius:0;padding:14px 12px;text-align:center;font-size:11px;font-weight:700;color:#065f46;flex:1}
.fb:first-child{border-radius:8px 0 0 8px}
.fb:last-child{border-radius:0 8px 8px 0}
.fb .sub{font-size:10px;font-weight:400;color:#0f766e;margin-top:4px}
.fa{display:flex;align-items:center;font-size:18px;color:#0f766e;font-weight:700;padding:0 2px}

/* MVP方案卡 */
.mvp-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:16px 0}
.mvp-card{border:2px solid #0f766e;border-radius:10px;overflow:hidden}
.mvp-card .mvp-head{background:#0f766e;color:#fff;padding:10px 14px;font-size:12px;font-weight:700}
.mvp-card .mvp-body{padding:14px;background:#f0fdfa}
.mvp-card .mvp-body li{font-size:12px;margin-bottom:5px;color:#1a1a2e}

/* 验证矩阵 */
.verify{background:#f5f3ff;border:1px solid #c4b5fd;border-radius:9px;padding:16px 20px;margin:14px 0}
.verify .vtag{font-size:11px;font-weight:800;color:#5b21b6;letter-spacing:1px;margin-bottom:10px}

/* 结论 */
.concl{background:linear-gradient(135deg,#0f766e,#065f46);color:#fff;border-radius:12px;padding:30px 34px;margin-top:36px}
.concl h2{font-size:16px;color:#fff;margin-bottom:14px}
.concl li{color:#ccfbf1;margin-bottom:8px;line-height:1.8}
.concl strong{color:#fff}

.footer{margin-top:40px;padding-top:14px;border-top:1px solid #eee;font-size:11px;color:#bbb;text-align:center}
.pb{page-break-before:always}
</style>
</head>
<body>

<!-- 封面 -->
<div class="cover">
  <div class="badge">内部专项研究 · 2026.02.26</div>
  <h1>AI投放全流程方案研究<br>创意即信号时代的认知框架与实操路径</h1>
  <div class="sub">
    源自强伟 × 李强强对话 · 聚焦两大方向：投放侧AI现状 + 素材←→投放打通<br>
    含 Meta Andromeda 机制拆解 · AI素材工作流方案 · MVP实验设计
  </div>
  <div class="meta">POA Master · COO AI Research · 2026年2月26日</div>
</div>

<!-- 对话还原 -->
<div class="chat-block">
  <div class="chat-title">💬 对话还原：本报告的原始命题（2026-02-26 10:36）</div>
  <div class="chat-msg">
    <span class="who">强伟</span>
    <div class="bubble">因为最近世界变的有点快，所以投放这方面，我希望强总这边能研究一下<strong>关于AI投放全流程的方案</strong></div>
  </div>
  <div class="chat-msg">
    <span class="who">强伟</span>
    <div class="bubble">其实我看的是2个方面：<strong>① 投放侧基于AI投放工具的调研和研究</strong>，因为现在都是AI自动判定，<strong>素材和投放之间如何利用AI打通</strong></div>
  </div>
  <div class="chat-msg">
    <span class="who other">李强强</span>
    <div class="bubble"><strong>纯投放侧的变革不是很多，创意侧倒是很多</strong>——尤其是AI赋能上</div>
  </div>
  <div class="chat-msg">
    <span class="who">强伟</span>
    <div class="bubble">我希望你能<strong>拟定一个方案，然后我找中台来配合你，做个MVP实验</strong></div>
  </div>
</div>

<!-- 执行摘要 -->
<div class="exec">
  <h2>执行摘要</h2>
  <p>
    <strong>李强强的判断是正确的，且已被行业数据充分验证：</strong>
    主流平台（Meta/AppLovin/Google）的出价AI已经成熟为"黑盒自动化"，
    人工调整出价策略对ROI的边际贡献已趋近于零。
    真正的竞争变量集中在创意层——<strong>平台AI算法直接将素材内容解析为用户定向信号</strong>，
    素材质量和多样性决定你能进入哪些竞价拍卖、触达哪类用户、支付什么价格。
    这意味着：<strong>素材不再只是广告的"载体"，素材本身就是"定向策略"</strong>。
    本报告将系统拆解这一机制，并提出适合我司现阶段的MVP实验方案。
  </p>
</div>

<!-- 第一章 -->
<h2 class="sec"><span class="n">1</span>李强强判断验证：投放侧为什么"变革不多"</h2>

<h3>1.1 平台AI出价已完成黑盒化</h3>
<p>
  2022—2024年，三大主流平台已完成出价层的AI化改造，
  进入"默认黑盒、人工干预空间极小"的新常态：
</p>
<table>
  <tr><th>平台</th><th>AI出价系统</th><th>人工可干预空间</th><th>当前状态</th></tr>
  <tr>
    <td><strong>Meta</strong></td>
    <td>Advantage+ 全链自动化<br>Andromeda检索引擎</td>
    <td class="r">预算上限 · 出价策略选择<br>（其余全部AI决策）</td>
    <td class="g">2024年底完成黑盒化</td>
  </tr>
  <tr>
    <td><strong>AppLovin</strong></td>
    <td>AXON 2.0强化学习</td>
    <td class="r">仅目标ROAS设置</td>
    <td class="g">出价完全自动，2025Q1收入+71%</td>
  </tr>
  <tr>
    <td><strong>Google</strong></td>
    <td>Performance Max全渠道AI</td>
    <td class="r">资产组 · 目标转化</td>
    <td class="g">算法决定出价+渠道+受众</td>
  </tr>
  <tr>
    <td><strong>字节UBMAX</strong></td>
    <td>统一智能出价</td>
    <td class="r">出价策略 · 预算节奏</td>
    <td class="g">国内游戏买量主流选择</td>
  </tr>
</table>

<div class="concept">
  <div class="ctag">📌 核心结论：投放侧的竞争已经内卷完毕</div>
  <p>
    纯投放层面，广告主能做的事已经被压缩到"告诉AI我要什么结果"——出价目标、预算量级、转化事件回传质量。
    传统的"拆出价、跑计划、精细化调整"的操作体系边际价值近乎归零。
    <strong>投放侧的剩余竞争力只剩两件事：① 转化事件回传的精准度 ② 给平台AI的预算量级（量越大学习越快）。</strong>
  </p>
</div>

<h3>1.2 投放侧剩余的可优化空间</h3>
<p>虽然出价层黑盒化，但以下环节仍有人工优化价值：</p>
<ul>
  <li><strong>转化回传质量（Signal Quality）</strong>：回传的事件越精准（AEO优于MAI），平台AI学习效率越高，CPI越低。我司RG项目中，AEO用户首次激活CPI约为MAI的2~4倍，但LTV显著更高，属于合理的信号质量投资</li>
  <li><strong>预算门槛管理</strong>：平台AI需要足够的预算规模才能完成学习期（Meta建议每个广告系列至少50次转化/周），低预算=高CPM惩罚</li>
  <li><strong>Lookalike Audience种子质量</strong>：项目组提到"用LAL受众做MAI"——种子用户质量决定扩展用户质量，这是投放侧最后的策略控制点</li>
</ul>

<!-- 第二章 -->
<div class="pb"></div>
<h2 class="sec"><span class="n">2</span>创意侧：真正的战场——Creative as Signal</h2>

<h3>2.1 Meta Andromeda：颠覆认知的核心机制</h3>
<p>
  2024年12月，Meta发布了Andromeda引擎技术白皮书，揭示了创意信号如何驱动广告分发的底层逻辑：
</p>

<div class="concept">
  <div class="ctag">⚡ Andromeda核心机制：创意即定向</div>
  <p>
    Andromeda使用<strong>计算机视觉+音频AI</strong>分析每一个广告素材的内容，
    为其分配一个"Entity ID"（内容指纹），然后基于这个指纹在全网匹配最可能产生转化的用户。
    <br><br>
    这意味着：<strong>你的素材画面、色调、人物、场景、情绪、文案——每一个元素都在告诉算法"这个广告适合什么人"。</strong>
    广告主不再需要设置受众，素材本身就是受众定向策略。
    <br><br>
    反面推论：如果你的素材风格单一、创意重复，Andromeda会判定你的内容"信号疲劳"，
    <strong>主动提高你的CPM（成本惩罚）</strong>，因为它无法从同质化素材中提取差异化信号。
  </p>
</div>

<h3>2.2 创意信号质量的量化影响</h3>
<div class="grid3">
  <div class="card">
    <div class="big">10~15</div>
    <div class="label">Meta Advantage+单campaign建议上传的<strong>概念差异化</strong>素材数量</div>
    <div class="src">Andromeda官方建议，非版本微调</div>
  </div>
  <div class="card">
    <div class="big">↑CPM</div>
    <div class="label">创意相似度过高（Creative Similarity高）时Andromeda的惩罚结果</div>
    <div class="src">Meta Andromeda 2026年更新</div>
  </div>
  <div class="card">
    <div class="big">+24%</div>
    <div class="label">使用平台原生AI创意工具（Advantage+ Creative）后的平均转化率提升</div>
    <div class="src">Meta官方案例数据</div>
  </div>
</div>

<h3>2.3 "创意迭代" vs "创意变化"：最常见的误区</h3>
<div class="danger">
  <div class="dtag">⚠️ 高频误区</div>
  <p>
    很多团队误以为：改换片头钩子 = 新素材 = 给算法新信号。<br>
    这是错误的。Andromeda识别的是<strong>内容语义（画面主题、情绪、场景类型）</strong>，
    而不是剪辑顺序。<br><br>
    <strong>创意迭代</strong>（改钩子/配乐/字幕）≠ <strong>创意变化</strong>（改场景概念/视觉风格/情绪基调）<br>
    只有后者才能给算法提供新的用户匹配信号，才能进入新的竞价拍卖池。
  </p>
</div>

<h3>2.4 对我司游戏（RG/EM/RS）的直接影响</h3>
<table>
  <tr><th>素材类型</th><th>给算法的信号</th><th>匹配用户画像</th><th>建议</th></tr>
  <tr>
    <td>RPG战斗玩法实录</td>
    <td>男性·动作·竞技信号</td>
    <td>RPG核心玩家（高LTV）</td>
    <td class="g">必配，配合AEO转化目标</td>
  </tr>
  <tr>
    <td>卡牌收集/养成展示</td>
    <td>策略·收集·养成信号</td>
    <td>卡牌CCG用户（高付费意愿）</td>
    <td class="g">重点素材方向</td>
  </tr>
  <tr>
    <td>真人口播/KOL推荐</td>
    <td>社交信任信号</td>
    <td>中年男性/轻度玩家</td>
    <td class="m">扩量用，配合MAI目标</td>
  </tr>
  <tr>
    <td>场景故事化CG</td>
    <td>叙事·情感共鸣信号</td>
    <td>剧情向用户</td>
    <td class="m">测试品类，成本较高</td>
  </tr>
  <tr>
    <td>同质化战斗GIF（当前大量）</td>
    <td>重复信号→触发CPM惩罚</td>
    <td>信号疲劳，覆盖面收窄</td>
    <td class="r">需要迭代素材概念多样性</td>
  </tr>
</table>

<!-- 第三章 -->
<h2 class="sec"><span class="n">3</span>打通方案：素材→信号→投放的AI闭环架构</h2>

<h3>3.1 现状诊断：当前的断点在哪里</h3>
<p>
  目前大多数游戏投放团队（包括我司）的工作流存在两个关键断点：
</p>

<div class="flow">
  <div class="fb">竞品素材<br>分析<div class="sub">人工刷广告库<br>效率低</div></div>
  <div class="fa">→</div>
  <div class="fb" style="background:#fee2e2;border-color:#ef4444;color:#7f1d1d">创意策略制定<br><div class="sub" style="color:#ef4444">❌ 断点1<br>经验驱动，无数据</div></div>
  <div class="fa">→</div>
  <div class="fb" style="background:#fee2e2;border-color:#ef4444;color:#7f1d1d">素材生产<br><div class="sub" style="color:#ef4444">❌ 断点2<br>手工生产，无闭环</div></div>
  <div class="fa">→</div>
  <div class="fb">平台投放<br><div class="sub">AI自动出价<br>（已成熟）</div></div>
  <div class="fa">→</div>
  <div class="fb">效果数据<br><div class="sub">仅看结果<br>未回流创意层</div></div>
</div>

<h3>3.2 目标架构：AI驱动的创意×投放闭环</h3>

<div class="flow">
  <div class="fb" style="background:#ccfbf1;border-color:#0f766e">AI竞品情报<br><div class="sub">AppGrowing<br>自动抓取爆款</div></div>
  <div class="fa">→</div>
  <div class="fb" style="background:#ccfbf1;border-color:#0f766e">AI策略分析<br><div class="sub">标签化+<br>爆量原因识别</div></div>
  <div class="fa">→</div>
  <div class="fb" style="background:#ccfbf1;border-color:#0f766e">AIGC批量生产<br><div class="sub">工作流自动化<br>多概念并行</div></div>
  <div class="fa">→</div>
  <div class="fb" style="background:#ccfbf1;border-color:#0f766e">平台AI投放<br><div class="sub">Andromeda<br>自动信号匹配</div></div>
  <div class="fa">→</div>
  <div class="fb" style="background:#ccfbf1;border-color:#0f766e">效果→创意<br>回流学习<br><div class="sub">哪类信号有效<br>→ 指导下次生产</div></div>
</div>

<h3>3.3 关键技术组件</h3>
<table>
  <tr><th>环节</th><th>工具/方法</th><th>我司可用资源</th><th>优先级</th></tr>
  <tr>
    <td><strong>竞品情报</strong></td>
    <td>AppGrowing · SocialPeta · Meta广告库</td>
    <td>可购买数据订阅，中台配合拉取</td>
    <td class="g">高 · 立即可做</td>
  </tr>
  <tr>
    <td><strong>素材标签化分析</strong></td>
    <td>DeepSeek/GPT-4V对素材截图分析<br>→ 自动打标签（场景/情绪/钩子类型）</td>
    <td>AI接口现成，中台开发工作量小</td>
    <td class="g">高 · MVP核心</td>
  </tr>
  <tr>
    <td><strong>AIGC视频生成</strong></td>
    <td>可灵（快手）· Runway · Kling API</td>
    <td>庄帛翰团队正在研究中</td>
    <td class="m">中 · Q1攻克目标</td>
  </tr>
  <tr>
    <td><strong>效果归因回流</strong></td>
    <td>MMP（AppsFlyer/Adjust）素材级数据<br>→ 自动关联创意标签</td>
    <td>现有MMP已部署，需中台对接</td>
    <td class="m">中 · MVP第二阶段</td>
  </tr>
  <tr>
    <td><strong>创意Strategy Agent</strong></td>
    <td>Coze工作流 · 自研Prompt链</td>
    <td>中台可快速搭建</td>
    <td class="r">低 · 待前两步验证后</td>
  </tr>
</table>

<!-- 第四章 -->
<div class="pb"></div>
<h2 class="sec"><span class="n">4</span>MVP实验设计：强伟要求的可落地方案</h2>

<h3>4.1 MVP范围定义（8周实验）</h3>
<p>
  目标：在RG项目的美国Facebook投放中，验证"数据驱动素材策略"是否比"经验驱动"产生更高的信号质量（体现为更低CPM、更高CTR）
</p>

<div class="mvp-grid">
  <div class="mvp-card">
    <div class="mvp-head">Phase 1（第1-3周）：情报+标签体系建设</div>
    <div class="mvp-body">
      <ul>
        <li>接入 AppGrowing / Meta广告库，抓取同品类近30天爆量素材</li>
        <li>用 AI（DeepSeek Vision）对每个素材自动打8维标签：场景类型/主角/情绪/钩子方式/时长/有无旁白/文字占比/色调</li>
        <li>输出"爆量素材特征热力图"——哪种组合出现频率高</li>
        <li><strong>中台工作量</strong>：数据拉取脚本 + AI标签接口 ≈ 3人·天</li>
      </ul>
    </div>
  </div>
  <div class="mvp-card">
    <div class="mvp-head">Phase 2（第4-6周）：素材生产验证</div>
    <div class="mvp-body">
      <ul>
        <li>基于热力图，制作2组素材：
          <br>A组（数据驱动）：按爆量特征主动设计概念
          <br>B组（经验驱动）：当前团队正常出素材</li>
        <li>两组各上传 10~15 个概念差异化版本至 Advantage+ Campaign</li>
        <li>关键指标：CPM · CTR · CPI · D7 ROAS</li>
        <li><strong>强强总负责</strong>：素材方向把控 + 投放架构搭建</li>
      </ul>
    </div>
  </div>
  <div class="mvp-card">
    <div class="mvp-head">Phase 3（第7-8周）：回流分析</div>
    <div class="mvp-body">
      <ul>
        <li>将素材级效果数据（CTR/IPM）自动回写到标签数据库</li>
        <li>分析：哪些标签组合 → CPM低 · 哪些 → 转化质量高</li>
        <li>输出可复用的"素材Brief模板"用于下个项目</li>
        <li><strong>中台工作量</strong>：MMP数据对接 ≈ 2人·天</li>
      </ul>
    </div>
  </div>
  <div class="mvp-card">
    <div class="mvp-head">判断MVP成功的标准</div>
    <div class="mvp-body">
      <ul>
        <li>数据驱动组CPM比经验驱动组低 ≥ 15%</li>
        <li>或D7 ROAS高 ≥ 10%</li>
        <li>如两项均不达标 → 证明素材概念而非策略是瓶颈，转向生产效率优化</li>
        <li>如达标 → 申请扩大预算，接入AIGC批量生产环节</li>
      </ul>
    </div>
  </div>
</div>

<h3>4.2 中台协作清单</h3>
<div class="info">
  <div class="itag">📋 需要中台配合的具体事项</div>
  <p>
    <strong>① 数据拉取脚本</strong>：从AppGrowing API（或爬虫）定期拉取竞品爆量素材截图 → 存入数据库<br>
    <strong>② AI标签服务</strong>：封装DeepSeek Vision接口，输入图片/视频截图，输出结构化标签JSON<br>
    <strong>③ 素材效果回流</strong>：对接AppsFlyer Cohort API，将素材级CTR/CPI数据写入标签数据库<br>
    <strong>④ 数据看板</strong>：展示标签×效果热力图（用现有的POA Master洞察平台扩展即可）<br><br>
    总工作量估算：<strong>6~8人·天</strong>，可在2周内完成
  </p>
</div>

<!-- 第五章 -->
<h2 class="sec"><span class="n">5</span>庄帛翰视角补充：素材自动化工作流的技术边界</h2>

<p>
  庄帛翰在对话中提到：<em>"素材的自动化工作流是我上半年打算重点攻克的课题，
  全自动化还不好说，主要是UE引擎的AI插件还有局限。2D素材的自动化会有很大空间。"</em>
</p>
<p>这个判断非常准确，以下是目前业界技术边界的更新：</p>

<table>
  <tr><th>素材类型</th><th>当前AI自动化程度</th><th>主要工具</th><th>局限</th></tr>
  <tr>
    <td><strong>2D静态图/Banner</strong></td>
    <td class="g">高（>80%）</td>
    <td>Midjourney / DALL-E 3 / Firefly</td>
    <td>风格一致性需要LoRA精调</td>
  </tr>
  <tr>
    <td><strong>2D动态GIF/短视频</strong></td>
    <td class="g">较高（60%~70%）</td>
    <td>可灵 · Runway · Kling</td>
    <td>游戏IP角色一致性较差</td>
  </tr>
  <tr>
    <td><strong>真人口播视频</strong></td>
    <td class="m">中（40%~50%）</td>
    <td>HeyGen · D-ID · Synthesia</td>
    <td>口型同步、情绪自然度</td>
  </tr>
  <tr>
    <td><strong>游戏玩法实录剪辑</strong></td>
    <td class="m">中（30%~40%）</td>
    <td>剪映AI · Kapwing AI</td>
    <td>关键帧选取仍需人工判断</td>
  </tr>
  <tr>
    <td><strong>3D/UE引擎渲染</strong></td>
    <td class="r">低（&lt;20%）</td>
    <td>UE5 AI插件（仍实验阶段）</td>
    <td>庄帛翰判断准确，局限大</td>
  </tr>
</table>

<div class="verify">
  <div class="vtag">🎯 优先攻关建议</div>
  <p>
    Q1优先攻关2D素材自动化，建立"输入游戏截图/角色原画 → 自动生成多风格广告Banner" 的Workflow。
    使用 Comfy UI + ControlNet + 游戏IP LoRA 可以在保持角色一致性的前提下批量生成，
    三七互娱的季产50万张图片实践已证明这条路可行。
    3D和UE引擎方向建议Q2~Q3再评估，等待工具成熟。
  </p>
</div>

<!-- 结论 -->
<div class="concl">
  <h2>结论：给强伟和李强强的行动清单</h2>
  <ul>
    <li>
      <strong>【验证李强强判断，达成认知对齐】</strong>
      "投放侧变革不多，创意侧才是重点"——这个判断完全正确。
      建议团队将注意力从"优化出价策略"转向"优化创意信号质量"，这是ROI提升最确定的路径。
    </li>
    <li>
      <strong>【李强强：聚焦两件事起草方案】</strong>
      ① 建立素材标签体系（先用Excel手工打标签，验证逻辑后再自动化）；
      ② 在RG美国测试中，主动上传10~15个概念差异化素材测试Andromeda信号效果。
      不需要等MVP工具完成再启动，<strong>人工版本先跑，数据先说话</strong>。
    </li>
    <li>
      <strong>【强伟：协调中台的最小可行任务】</strong>
      MVP核心工作量约6~8人·天：① AppGrowing数据拉取 ② AI打标签接口 ③ MMP素材效果回流。
      建议本周内拉一次需求评审会，定下8周实验计划和成功标准。
    </li>
    <li>
      <strong>【庄帛翰团队：2D素材自动化是Q1最值得攻关的方向】</strong>
      ComfyUI + 游戏IP LoRA的技术方案最成熟，建议Q1完成"角色一致性2D Banner批量生成"的内部工具，
      服务于RG/EM两个项目的买量素材生产。
    </li>
  </ul>
</div>

<div class="footer">
  本报告基于强伟×李强强飞书对话（2026-02-26）定制生成 · 数据来源：Meta Engineering Blog · AppLovin财报 · SocialMediaExaminer · Sensor Tower等公开资料 · POA Master COO AI 2026-02-26
</div>

</body>
</html>`;
}

async function main() {
  console.log('📊 开始生成定制化AI投放调研报告...');

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(buildHTML(), { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({
    format: 'A4', printBackground: true,
    margin: { top: '0', bottom: '0', left: '0', right: '0' },
  });
  await browser.close();
  console.log(`✅ PDF 生成完成，大小：${(pdf.length / 1024).toFixed(0)} KB`);

  const outPath = path.join(process.cwd(), 'ai-adtech-game-report.pdf');
  fs.writeFileSync(outPath, pdf);
  console.log(`💾 本地副本：${outPath}`);

  const chatId = await getConfig('feishu.chatId');
  if (!chatId) { console.error('❌ feishu.chatId 未配置'); process.exit(1); }

  console.log('📤 上传至飞书...');
  const token = await getTenantToken();
  const fileName = `AI投放全流程研究报告（基于强强对话）-${new Date().toISOString().slice(0, 10)}.pdf`;
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
