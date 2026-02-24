import puppeteer from 'puppeteer';

interface PDFCardData {
  title: string;
  category: string;
  priority: string;
  summary: string;
  details: string;
  impact: string | null;
  action: string | null;
  sources: Array<{ title: string; url: string }>;
  createdAt: string; // ISO date string
}

const CATEGORY_MAP: Record<string, { color: string; label: string }> = {
  risk: { color: '#ef4444', label: '风险洞察' },
  industry: { color: '#3b82f6', label: '行业洞察' },
  competitor: { color: '#8b5cf6', label: '竞品洞察' },
  internal: { color: '#06b6d4', label: '内部洞察' },
  tech: { color: '#10b981', label: '技术洞察' },
  opportunity: { color: '#f59e0b', label: '机会洞察' },
};

const PRIORITY_MAP: Record<string, { color: string; label: string }> = {
  high: { color: '#ef4444', label: '高优先级' },
  medium: { color: '#f59e0b', label: '中优先级' },
  low: { color: '#94a3b8', label: '低优先级' },
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Convert simple markdown to HTML.
 * Supports: **bold**, ### headers, ## headers, - bullet lists
 */
function markdownToHtml(md: string): string {
  const escaped = escapeHtml(md);
  const lines = escaped.split('\n');
  const result: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Close list if current line is not a list item
    if (inList && !trimmed.startsWith('- ')) {
      result.push('</ul>');
      inList = false;
    }

    if (trimmed.startsWith('### ')) {
      result.push(`<h3 class="md-h3">${applyInline(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith('## ')) {
      result.push(`<h2 class="md-h2">${applyInline(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith('- ')) {
      if (!inList) {
        result.push('<ul class="md-list">');
        inList = true;
      }
      result.push(`<li>${applyInline(trimmed.slice(2))}</li>`);
    } else if (trimmed === '') {
      result.push('<div class="md-spacer"></div>');
    } else {
      result.push(`<p class="md-p">${applyInline(trimmed)}</p>`);
    }
  }

  if (inList) {
    result.push('</ul>');
  }

  return result.join('\n');
}

/** Apply inline markdown transforms (bold) */
function applyInline(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTimestamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function buildHtml(card: PDFCardData): string {
  const cat = CATEGORY_MAP[card.category] || { color: '#6b7280', label: card.category };
  const pri = PRIORITY_MAP[card.priority] || { color: '#94a3b8', label: card.priority };
  const date = formatDate(card.createdAt);
  const now = formatTimestamp();

  const detailsHtml = markdownToHtml(card.details);

  const impactSection = card.impact
    ? `
    <div class="info-box impact-box">
      <div class="info-box-label">影响评估</div>
      <div class="info-box-content">${markdownToHtml(card.impact)}</div>
    </div>`
    : '';

  const actionSection = card.action
    ? `
    <div class="info-box action-box">
      <div class="info-box-label">建议行动</div>
      <div class="info-box-content">${markdownToHtml(card.action)}</div>
    </div>`
    : '';

  const sourcesSection =
    card.sources && card.sources.length > 0
      ? `
    <div class="sources-section">
      <div class="sources-label">信息来源</div>
      <ul class="sources-list">
        ${card.sources.map((s) => `<li><a href="${escapeHtml(s.url)}">${escapeHtml(s.title)}</a></li>`).join('\n        ')}
      </ul>
    </div>`
      : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    color: #1e293b;
    line-height: 1.7;
    font-size: 14px;
    background: #fff;
  }

  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 0;
    position: relative;
  }

  /* Color bar at very top */
  .color-bar {
    height: 6px;
    background: ${cat.color};
    width: 100%;
  }

  .content {
    padding: 32px 40px 60px 40px;
  }

  /* Header */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 28px;
    padding-bottom: 16px;
    border-bottom: 1px solid #e2e8f0;
  }

  .brand {
    font-size: 13px;
    color: #64748b;
    font-weight: 500;
    letter-spacing: 0.5px;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }

  .category-badge {
    background: ${cat.color}18;
    color: ${cat.color};
    border: 1px solid ${cat.color}40;
  }

  .priority-badge {
    background: ${pri.color}18;
    color: ${pri.color};
    border: 1px solid ${pri.color}40;
  }

  .date-text {
    font-size: 12px;
    color: #94a3b8;
  }

  /* Title */
  .title {
    font-size: 22px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 24px;
    line-height: 1.4;
  }

  /* Summary box */
  .summary-box {
    background: #f8fafc;
    border-left: 4px solid ${cat.color};
    padding: 16px 20px;
    margin-bottom: 28px;
    border-radius: 0 6px 6px 0;
  }

  .summary-box p {
    font-size: 14px;
    color: #334155;
    line-height: 1.8;
  }

  /* Details section */
  .details-section {
    margin-bottom: 28px;
  }

  .details-section .md-h2 {
    font-size: 17px;
    font-weight: 700;
    color: #0f172a;
    margin: 20px 0 10px 0;
    padding-bottom: 6px;
    border-bottom: 1px solid #f1f5f9;
  }

  .details-section .md-h3 {
    font-size: 15px;
    font-weight: 600;
    color: #1e293b;
    margin: 16px 0 8px 0;
  }

  .details-section .md-p {
    margin-bottom: 8px;
    color: #334155;
    line-height: 1.8;
  }

  .details-section .md-list {
    margin: 8px 0 8px 20px;
    color: #334155;
  }

  .details-section .md-list li {
    margin-bottom: 4px;
    line-height: 1.8;
  }

  .details-section .md-spacer {
    height: 8px;
  }

  /* Info boxes (impact / action) */
  .info-box {
    padding: 16px 20px;
    border-radius: 6px;
    margin-bottom: 20px;
  }

  .info-box-label {
    font-size: 13px;
    font-weight: 700;
    margin-bottom: 8px;
    letter-spacing: 0.3px;
  }

  .info-box-content .md-p {
    margin-bottom: 6px;
    line-height: 1.8;
  }

  .info-box-content .md-list {
    margin: 6px 0 6px 20px;
  }

  .info-box-content .md-list li {
    margin-bottom: 3px;
    line-height: 1.8;
  }

  .impact-box {
    background: #fffbeb;
    border: 1px solid #fde68a;
  }

  .impact-box .info-box-label {
    color: #92400e;
  }

  .impact-box .info-box-content,
  .impact-box .info-box-content .md-p,
  .impact-box .info-box-content .md-list {
    color: #78350f;
  }

  .action-box {
    background: #eff6ff;
    border: 1px solid #bfdbfe;
  }

  .action-box .info-box-label {
    color: #1e40af;
  }

  .action-box .info-box-content,
  .action-box .info-box-content .md-p,
  .action-box .info-box-content .md-list {
    color: #1e3a5f;
  }

  /* Sources */
  .sources-section {
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid #e2e8f0;
  }

  .sources-label {
    font-size: 13px;
    font-weight: 700;
    color: #64748b;
    margin-bottom: 8px;
    letter-spacing: 0.3px;
  }

  .sources-list {
    list-style: none;
    padding: 0;
  }

  .sources-list li {
    margin-bottom: 4px;
    font-size: 12px;
  }

  .sources-list a {
    color: #3b82f6;
    text-decoration: none;
  }

  .sources-list a:hover {
    text-decoration: underline;
  }

  /* Footer */
  .footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 40px;
    border-top: 1px solid #e2e8f0;
    background: #fff;
    font-size: 11px;
    color: #94a3b8;
  }
</style>
</head>
<body>
  <div class="page">
    <div class="color-bar"></div>
    <div class="content">
      <div class="header">
        <div class="brand">POA Master · 洞察简报</div>
        <div class="header-right">
          <span class="badge category-badge">${escapeHtml(cat.label)}</span>
          <span class="badge priority-badge">${escapeHtml(pri.label)}</span>
          <span class="date-text">${escapeHtml(date)}</span>
        </div>
      </div>

      <h1 class="title">${escapeHtml(card.title)}</h1>

      <div class="summary-box">
        <p>${escapeHtml(card.summary)}</p>
      </div>

      <div class="details-section">
        ${detailsHtml}
      </div>

      ${impactSection}
      ${actionSection}
      ${sourcesSection}
    </div>

    <div class="footer">
      <span>POA Master 洞察简报 · COO 关注</span>
      <span>生成于 ${escapeHtml(now)}</span>
    </div>
  </div>
</body>
</html>`;
}

export async function generateInsightPDF(card: PDFCardData): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    const html = buildHtml(card);
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
