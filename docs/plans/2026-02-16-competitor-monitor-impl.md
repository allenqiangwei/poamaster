# Competitor Monitor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a competitive intelligence service that monitors competitor mobile games across App Store reviews, website changes, and industry news, with AI analysis integrated into the existing Insights Briefing.

**Architecture:** A standalone Node.js service (`services/competitor-monitor/`) follows the same pattern as `services/sentiment-collector/` — PrismaClient, node-cron scheduler, and tsx runner. Data is collected into new Prisma models and consumed by the existing `lib/insights/` pipeline during briefing generation.

**Tech Stack:** TypeScript, Prisma ORM, node-cron, app-store-scraper, google-play-scraper, cheerio (HTML parsing), rss-parser, OpenAI (Claude via compatible API), Feishu Bot API (alerts)

---

## Task 1: Add Prisma Models

**Files:**
- Modify: `prisma/schema.prisma` (append after line 719, before enums are fine — add after the `BotMessage` model at line 671)

**Step 1: Add the 6 new models to schema.prisma**

Append these models before the `enum TaskStatus` block (line 673):

```prisma
model Competitor {
  id           String                  @id @default(cuid())
  name         String
  company      String?
  appStoreId   String?
  googlePlayId String?
  websiteUrl   String?
  monitorUrls  Json                    @default("[]")
  rssFeeds     Json                    @default("[]")
  keywords     Json                    @default("[]")
  enabled      Boolean                 @default(true)
  createdAt    DateTime                @default(now())
  updatedAt    DateTime                @updatedAt
  appSnapshots CompetitorAppSnapshot[]
  reviews      CompetitorReview[]
  webChanges   CompetitorWebChange[]
  news         CompetitorNews[]
  alerts       CompetitorAlert[]

  @@index([enabled])
}

model CompetitorAppSnapshot {
  id           String     @id @default(cuid())
  competitorId String
  platform     String
  rating       Float?
  ratingCount  Int?
  version      String?
  releaseNotes String?
  snapshotData Json?
  createdAt    DateTime   @default(now())
  competitor   Competitor @relation(fields: [competitorId], references: [id], onDelete: Cascade)

  @@index([competitorId, createdAt])
}

model CompetitorReview {
  id           String     @id @default(cuid())
  competitorId String
  platform     String
  externalId   String
  author       String?
  rating       Int
  title        String?
  content      String
  sentiment    Float?
  tags         Json?
  reviewDate   DateTime
  createdAt    DateTime   @default(now())
  competitor   Competitor @relation(fields: [competitorId], references: [id], onDelete: Cascade)

  @@unique([platform, externalId])
  @@index([competitorId, reviewDate])
}

model CompetitorWebChange {
  id           String     @id @default(cuid())
  competitorId String
  url          String
  changeType   String
  summary      String?
  diffText     String?
  previousHash String?
  currentHash  String?
  createdAt    DateTime   @default(now())
  competitor   Competitor @relation(fields: [competitorId], references: [id], onDelete: Cascade)

  @@index([competitorId, createdAt])
}

model CompetitorNews {
  id           String     @id @default(cuid())
  competitorId String?
  title        String
  url          String     @unique
  source       String
  summary      String?
  impact       String?
  category     String?
  publishedAt  DateTime?
  createdAt    DateTime   @default(now())
  competitor   Competitor? @relation(fields: [competitorId], references: [id], onDelete: SetNull)

  @@index([competitorId, createdAt])
}

model CompetitorAlert {
  id           String     @id @default(cuid())
  competitorId String
  alertType    String
  severity     String
  title        String
  summary      String
  acknowledged Boolean    @default(false)
  createdAt    DateTime   @default(now())
  competitor   Competitor @relation(fields: [competitorId], references: [id], onDelete: Cascade)

  @@index([competitorId, createdAt])
  @@index([acknowledged])
}
```

**Step 2: Run migration**

```bash
cd /Users/allenqiang/poamaster
npx prisma migrate dev --name add_competitor_monitor_models
```

Expected: Migration file created, Prisma client regenerated.

**Step 3: Restart dev server** (Turbopack caches old Prisma client)

```bash
# Kill existing dev server, then restart
npm run dev
```

**Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add Competitor monitor Prisma models (6 tables)"
```

---

## Task 2: Scaffold competitor-monitor Service

**Files:**
- Create: `services/competitor-monitor/package.json`
- Create: `services/competitor-monitor/tsconfig.json`
- Create: `services/competitor-monitor/ecosystem.config.cjs`
- Create: `services/competitor-monitor/src/logger.ts`
- Create: `services/competitor-monitor/src/scheduler.ts`
- Create: `services/competitor-monitor/src/index.ts`

**Step 1: Create package.json**

Reference: `services/sentiment-collector/package.json`

```json
{
  "name": "competitor-monitor",
  "version": "1.0.0",
  "description": "Competitive intelligence collector for POA Master",
  "private": true,
  "scripts": {
    "start": "tsx src/index.ts",
    "dev": "tsx watch src/index.ts",
    "prisma:generate": "prisma generate --schema ../../prisma/schema.prisma"
  },
  "prisma": {
    "schema": "../../prisma/schema.prisma"
  },
  "dependencies": {
    "app-store-scraper": "^0.18.0",
    "google-play-scraper": "^9.1.1",
    "cheerio": "^1.0.0",
    "rss-parser": "^3.13.0",
    "node-cron": "^3.0.0",
    "sentiment": "^5.0.2"
  },
  "devDependencies": {
    "@types/node-cron": "^3.0.11",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

**Step 2: Create tsconfig.json**

Copy exactly from `services/sentiment-collector/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

**Step 3: Create ecosystem.config.cjs**

Reference: `services/sentiment-collector/ecosystem.config.cjs`

```javascript
module.exports = {
  apps: [
    {
      name: 'competitor-monitor',
      script: 'src/index.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      cwd: '/Users/allenqiang/poamaster/services/competitor-monitor',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/Users/allenqiang/poamaster/logs/competitor-monitor-error.log',
      out_file: '/Users/allenqiang/poamaster/logs/competitor-monitor-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
    },
  ],
};
```

**Step 4: Create src/logger.ts**

```typescript
const PREFIX = '[Competitor]';

export const logger = {
  info: (...args: any[]) => console.log(PREFIX, ...args),
  warn: (...args: any[]) => console.warn(PREFIX, ...args),
  error: (...args: any[]) => console.error(PREFIX, ...args),
};
```

**Step 5: Create src/scheduler.ts**

Copy from `services/sentiment-collector/src/scheduler.ts` (identical logic):

```typescript
import cron from 'node-cron';
import { logger } from './logger.js';

interface Job {
  name: string;
  schedule: string;
  fn: () => Promise<void>;
}

const jobs: Job[] = [];

export function registerJob(name: string, cronSchedule: string, asyncFn: () => Promise<void>) {
  jobs.push({ name, schedule: cronSchedule, fn: asyncFn });
}

export function startScheduler() {
  for (const job of jobs) {
    cron.schedule(job.schedule, async () => {
      logger.info(`[Scheduler] Starting job: ${job.name}`);
      try {
        await job.fn();
        logger.info(`[Scheduler] Completed job: ${job.name}`);
      } catch (error: any) {
        logger.error(`[Scheduler] Job ${job.name} failed:`, error.message);
      }
    });
    logger.info(`[Scheduler] Registered job: ${job.name} (${job.schedule})`);
  }
}

export async function runNow(name: string) {
  const job = jobs.find(j => j.name === name);
  if (!job) {
    logger.error(`[Scheduler] Job not found: ${name}`);
    return;
  }
  logger.info(`[Scheduler] Running job immediately: ${name}`);
  try {
    await job.fn();
    logger.info(`[Scheduler] Completed job: ${name}`);
  } catch (error: any) {
    logger.error(`[Scheduler] Job ${name} failed:`, error.message);
  }
}
```

**Step 6: Create src/index.ts**

Reference: `services/sentiment-collector/src/index.ts`

```typescript
/**
 * Competitor Monitor Service — Entry Point
 *
 * Collects competitor app store reviews, website changes, and industry news
 * on a cron schedule, stores them via Prisma, and triggers alerts.
 */

import { PrismaClient } from '@prisma/client';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';
import { registerJob, startScheduler, runNow } from './scheduler.js';

// Resolve paths relative to source file, not cwd
const __dirname = dirname(fileURLToPath(import.meta.url));
export const SERVICE_DIR = resolve(__dirname, '..');
const ROOT_DIR = resolve(SERVICE_DIR, '../..');

// Load .env from project root
const envPath = join(ROOT_DIR, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
  logger.info(`Loaded env from ${envPath}`);
}

const PID_FILE = join(SERVICE_DIR, '.pid');

// Write PID file for process management
writeFileSync(PID_FILE, String(process.pid));

// Shared Prisma client
export const prisma = new PrismaClient();

// Register collection jobs
// App store reviews: 08:00 and 20:00 daily
registerJob('collect-competitor-reviews', '0 8,20 * * *', async () => {
  const { collectCompetitorReviews } = await import('./collectors/appstore.js');
  await collectCompetitorReviews();
});

// Website change detection: every 6 hours
registerJob('detect-web-changes', '0 */6 * * *', async () => {
  const { detectWebChanges } = await import('./collectors/webchange.js');
  await detectWebChanges();
});

// News/RSS collection: every 4 hours
registerJob('collect-competitor-news', '0 */4 * * *', async () => {
  const { collectCompetitorNews } = await import('./collectors/news.js');
  await collectCompetitorNews();
});

// Start scheduler
startScheduler();

// If --run-now flags are passed, run collection immediately
if (process.argv.includes('--run-now-reviews')) {
  runNow('collect-competitor-reviews');
}
if (process.argv.includes('--run-now-web')) {
  runNow('detect-web-changes');
}
if (process.argv.includes('--run-now-news')) {
  runNow('collect-competitor-news');
}

logger.info(`Competitor Monitor running. PID: ${process.pid}`);
logger.info('Press Ctrl+C to stop.');

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info(`Received ${signal}, shutting down...`);
  await prisma.$disconnect();

  try {
    unlinkSync(PID_FILE);
  } catch {
    // PID file may already be gone
  }

  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
```

**Step 7: Install dependencies**

```bash
cd /Users/allenqiang/poamaster/services/competitor-monitor
npm install
```

**Step 8: Commit**

```bash
git add services/competitor-monitor/
git commit -m "feat: scaffold competitor-monitor service with scheduler"
```

---

## Task 3: App Store Review Collector

**Files:**
- Create: `services/competitor-monitor/src/collectors/appstore.ts`
- Create: `services/competitor-monitor/src/sentiment.ts`
- Create: `services/competitor-monitor/src/alerter.ts`

**Step 1: Create src/sentiment.ts**

Reuse the same sentiment analysis logic from sentiment-collector. We import the pattern rather than adding a cross-service dependency:

```typescript
import Sentiment from 'sentiment';

const analyzer = new Sentiment();

const GAME_KEYWORDS: Record<string, number> = {
  'bug': -3, 'bugs': -3, 'crash': -4, 'crashes': -4, 'lag': -3, 'laggy': -3,
  'p2w': -4, 'pay2win': -4, 'pay-to-win': -4, 'paywall': -3,
  'scam': -4, 'ripoff': -4, 'greedy': -3,
  'unplayable': -4, 'broken': -3, 'glitch': -3, 'glitchy': -3,
  'boring': -2, 'repetitive': -2, 'grindy': -2,
  'addictive': 3, 'polished': 3, 'smooth': 2,
  'masterpiece': 4, 'gem': 3, 'brilliant': 3,
  'gorgeous': 3, 'stunning': 3, 'beautiful': 2,
  'immersive': 3, 'engaging': 2,
};

export function analyzeReview(
  title: string | null,
  content: string,
  rating: number
): { sentiment: number; tags: string[] } {
  const text = `${title || ''} ${content}`.toLowerCase();

  const textResult = analyzer.analyze(text, { extras: GAME_KEYWORDS });
  const textScore = Math.max(-1, Math.min(1, textResult.comparative * 2));
  const ratingScore = (rating - 3) / 2;
  const sentiment = Math.round((ratingScore * 0.7 + textScore * 0.3) * 100) / 100;

  const ISSUE_PATTERNS = [
    { keywords: ['bug', 'crash', 'glitch', 'broken'], tag: 'bugs' },
    { keywords: ['lag', 'slow', 'fps', 'performance'], tag: 'performance' },
    { keywords: ['pay', 'p2w', 'paywall', 'expensive'], tag: 'monetization' },
    { keywords: ['ad', 'ads', 'popup'], tag: 'ads' },
    { keywords: ['gameplay', 'boring', 'repetitive'], tag: 'gameplay' },
    { keywords: ['server', 'connection', 'disconnect'], tag: 'server' },
  ];

  const tags: string[] = [];
  for (const p of ISSUE_PATTERNS) {
    if (tags.length >= 5) break;
    if (p.keywords.some(kw => text.includes(kw))) tags.push(p.tag);
  }

  return { sentiment, tags };
}
```

**Step 2: Create src/alerter.ts**

Handles alert creation + Feishu notification (same pattern as `signal-detector.ts`):

```typescript
import { PrismaClient } from '@prisma/client';
import { createDecipheriv } from 'crypto';
import { logger } from './logger.js';

const BASE_URL = 'https://open.feishu.cn/open-apis';

let prisma: PrismaClient;

export function initAlerter(prismaClient: PrismaClient) {
  prisma = prismaClient;
}

export async function createAlert(
  competitorId: string,
  alertType: string,
  severity: string,
  title: string,
  summary: string
): Promise<void> {
  try {
    await prisma.competitorAlert.create({
      data: { competitorId, alertType, severity, title, summary },
    });

    logger.info(`[Alert] ${alertType}/${severity}: ${title}`);

    // Notify for HIGH+ severity
    if (severity === 'HIGH' || severity === 'CRITICAL') {
      await sendFeishuAlert(title, summary, severity).catch(err =>
        logger.error(`[Alert] Feishu notification failed: ${err.message}`)
      );
    }
  } catch (err: any) {
    logger.error(`[Alert] Failed to create alert: ${err.message}`);
  }
}

function decrypt(encryptedText: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return encryptedText;
  const parts = encryptedText.split(':');
  if (parts.length !== 3) return encryptedText;
  const key = Buffer.from(secret.padEnd(32, '0').slice(0, 32));
  const [ivHex, tagHex, encrypted] = parts;
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
}

async function getConfig(key: string): Promise<string> {
  const cfg = await prisma.config.findUnique({ where: { key } });
  return cfg?.value || '';
}

async function sendFeishuAlert(title: string, summary: string, severity: string): Promise<void> {
  const appId = await getConfig('feishu.appId');
  const appSecretRaw = await getConfig('feishu.appSecret');
  const targetChatId = await getConfig('feishu.chatId');
  if (!appId || !appSecretRaw || !targetChatId) return;

  const appSecret = decrypt(appSecretRaw);
  const icon = severity === 'CRITICAL' ? '🔴' : '🟡';
  const text = `${icon} 竞品情报 [${severity}]\n\n${title}\n\n${summary}\n\n时间: ${new Date().toLocaleString('zh-CN')}`;

  const tokenResp = await fetch(`${BASE_URL}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const tokenData = (await tokenResp.json()) as any;
  if (tokenData.code !== 0) return;

  await fetch(`${BASE_URL}/im/v1/messages?receive_id_type=chat_id`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenData.tenant_access_token}`,
    },
    body: JSON.stringify({
      receive_id: targetChatId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
    }),
  });

  logger.info(`[Alert] Feishu notification sent for ${severity}: ${title}`);
}
```

**Step 3: Create src/collectors/appstore.ts**

```typescript
import store from 'app-store-scraper';
import gplay from 'google-play-scraper';
import { prisma } from '../index.js';
import { logger } from '../logger.js';
import { analyzeReview } from '../sentiment.js';
import { createAlert } from '../alerter.js';

export async function collectCompetitorReviews() {
  const competitors = await prisma.competitor.findMany({
    where: { enabled: true },
    select: { id: true, name: true, appStoreId: true, googlePlayId: true },
  });

  logger.info(`[Reviews] Collecting for ${competitors.length} competitors...`);

  for (const comp of competitors) {
    if (comp.appStoreId) {
      await collectAppStoreReviews(comp.id, comp.name, comp.appStoreId).catch(err =>
        logger.error(`[Reviews] App Store failed for ${comp.name}: ${err.message}`)
      );
    }
    if (comp.googlePlayId) {
      await collectGooglePlayReviews(comp.id, comp.name, comp.googlePlayId).catch(err =>
        logger.error(`[Reviews] Google Play failed for ${comp.name}: ${err.message}`)
      );
    }
  }
}

async function collectAppStoreReviews(compId: string, name: string, appStoreId: string) {
  const numericId = appStoreId.replace(/\D/g, '');
  if (!numericId) return;

  // Snapshot: get current app info
  try {
    const appInfo = await store.app({ id: numericId });
    await prisma.competitorAppSnapshot.create({
      data: {
        competitorId: compId,
        platform: 'appstore',
        rating: appInfo.score || null,
        ratingCount: appInfo.reviews || null,
        version: appInfo.version || null,
        releaseNotes: appInfo.releaseNotes || null,
        snapshotData: { title: appInfo.title, developer: appInfo.developer },
      },
    });

    // Check rating drop alert
    await checkRatingDrop(compId, name, 'appstore', appInfo.score);
  } catch (err: any) {
    logger.warn(`[Reviews] App info fetch failed for ${name}: ${err.message}`);
  }

  // Reviews: collect last 3 pages
  let newCount = 0;
  for (const page of [1, 2, 3]) {
    try {
      const reviews = await store.reviews({
        id: numericId,
        page,
        sort: store.sort.RECENT,
        country: 'us',
      });
      if (!reviews || reviews.length === 0) break;

      for (const review of reviews) {
        const externalId = String(review.id);
        try {
          const rating = review.score || 3;
          const { sentiment, tags } = analyzeReview(review.title || null, review.text || '', rating);

          await prisma.competitorReview.create({
            data: {
              competitorId: compId,
              platform: 'appstore',
              externalId,
              author: review.userName || null,
              rating,
              title: review.title || null,
              content: review.text || '',
              sentiment,
              tags,
              reviewDate: review.updated ? new Date(review.updated) : new Date(),
            },
          });
          newCount++;
        } catch (err: any) {
          if (err.code === 'P2002') continue; // duplicate
          throw err;
        }
      }
    } catch (err: any) {
      logger.warn(`[Reviews] App Store page ${page} failed for ${name}: ${err.message}`);
      break;
    }
  }

  logger.info(`[Reviews] ${name} (App Store): ${newCount} new reviews`);
}

async function collectGooglePlayReviews(compId: string, name: string, packageName: string) {
  // Snapshot: get current app info
  try {
    const appInfo = await gplay.app({ appId: packageName });
    await prisma.competitorAppSnapshot.create({
      data: {
        competitorId: compId,
        platform: 'googleplay',
        rating: appInfo.score || null,
        ratingCount: appInfo.ratings || null,
        version: appInfo.version || null,
        releaseNotes: appInfo.recentChanges || null,
        snapshotData: { title: appInfo.title, developer: appInfo.developer },
      },
    });

    await checkRatingDrop(compId, name, 'googleplay', appInfo.score);
  } catch (err: any) {
    logger.warn(`[Reviews] Google Play info failed for ${name}: ${err.message}`);
  }

  // Reviews
  let newCount = 0;
  try {
    const reviews = await gplay.reviews({
      appId: packageName,
      sort: gplay.sort.NEWEST,
      num: 100,
    });

    for (const item of (reviews.data || [])) {
      const externalId = item.id || String(item.date);
      try {
        const rating = item.score || 3;
        const { sentiment, tags } = analyzeReview(item.title || null, item.text || '', rating);

        await prisma.competitorReview.create({
          data: {
            competitorId: compId,
            platform: 'googleplay',
            externalId,
            author: item.userName || null,
            rating,
            title: item.title || null,
            content: item.text || '',
            sentiment,
            tags,
            reviewDate: item.date ? new Date(item.date) : new Date(),
          },
        });
        newCount++;
      } catch (err: any) {
        if (err.code === 'P2002') continue;
        throw err;
      }
    }
  } catch (err: any) {
    logger.warn(`[Reviews] Google Play reviews failed for ${name}: ${err.message}`);
  }

  logger.info(`[Reviews] ${name} (Google Play): ${newCount} new reviews`);
}

async function checkRatingDrop(compId: string, name: string, platform: string, currentRating: number | null) {
  if (currentRating == null) return;

  // Get yesterday's snapshot
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const prevSnapshot = await prisma.competitorAppSnapshot.findFirst({
    where: {
      competitorId: compId,
      platform,
      createdAt: { lt: yesterday },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (prevSnapshot?.rating && prevSnapshot.rating - currentRating > 0.3) {
    await createAlert(
      compId,
      'rating_drop',
      'HIGH',
      `${name} ${platform} 评分骤降`,
      `评分从 ${prevSnapshot.rating.toFixed(1)} 降至 ${currentRating.toFixed(1)}（降幅 ${(prevSnapshot.rating - currentRating).toFixed(2)}）`
    );
  }
}
```

**Step 4: Verify the service starts without error**

```bash
cd /Users/allenqiang/poamaster/services/competitor-monitor
npx tsx src/index.ts
```

Expected: Service starts, registers 3 jobs, prints PID, no errors. Press Ctrl+C to stop.

**Step 5: Commit**

```bash
git add services/competitor-monitor/src/
git commit -m "feat: add competitor app store review collector with alerter"
```

---

## Task 4: Website Change Detector

**Files:**
- Create: `services/competitor-monitor/src/collectors/webchange.ts`

**Step 1: Create src/collectors/webchange.ts**

```typescript
import { createHash } from 'crypto';
import * as cheerio from 'cheerio';
import { prisma } from '../index.js';
import { logger } from '../logger.js';
import { createAlert } from '../alerter.js';

export async function detectWebChanges() {
  const competitors = await prisma.competitor.findMany({
    where: { enabled: true },
    select: { id: true, name: true, websiteUrl: true, monitorUrls: true },
  });

  logger.info(`[WebChange] Checking ${competitors.length} competitors...`);

  for (const comp of competitors) {
    const urls: { url: string; label: string }[] = [];

    if (comp.websiteUrl) {
      urls.push({ url: comp.websiteUrl, label: '官网' });
    }

    const extraUrls = comp.monitorUrls as Array<{ url: string; label: string }> || [];
    urls.push(...extraUrls);

    for (const { url, label } of urls) {
      try {
        await checkUrl(comp.id, comp.name, url, label);
      } catch (err: any) {
        logger.error(`[WebChange] ${comp.name} (${label}): ${err.message}`);
      }
    }
  }
}

async function checkUrl(compId: string, compName: string, url: string, label: string) {
  // Fetch page
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    logger.warn(`[WebChange] ${compName} (${label}): HTTP ${response.status}`);
    return;
  }

  const html = await response.text();

  // Extract main text content (strip nav, header, footer, scripts)
  const $ = cheerio.load(html);
  $('script, style, nav, header, footer, noscript, iframe').remove();
  const textContent = $('body').text().replace(/\s+/g, ' ').trim();

  // Hash current content
  const currentHash = createHash('sha256').update(textContent).digest('hex');

  // Get last change record for this URL
  const lastChange = await prisma.competitorWebChange.findFirst({
    where: { competitorId: compId, url },
    orderBy: { createdAt: 'desc' },
  });

  // First time — just save baseline
  if (!lastChange) {
    await prisma.competitorWebChange.create({
      data: {
        competitorId: compId,
        url,
        changeType: 'baseline',
        summary: `首次采集 ${label} 页面`,
        previousHash: null,
        currentHash,
      },
    });
    logger.info(`[WebChange] ${compName} (${label}): baseline saved`);
    return;
  }

  // No change
  if (lastChange.currentHash === currentHash) {
    return;
  }

  // Calculate change magnitude
  const prevLength = lastChange.diffText?.length || textContent.length;
  const changePct = Math.abs(textContent.length - prevLength) / Math.max(prevLength, 1);

  const changeType = changePct > 0.3 ? 'major_update' : 'content';
  const diffPreview = textContent.substring(0, 500);

  await prisma.competitorWebChange.create({
    data: {
      competitorId: compId,
      url,
      changeType,
      summary: `${label}页面有${changeType === 'major_update' ? '重大' : ''}更新（变化 ${Math.round(changePct * 100)}%）`,
      diffText: diffPreview,
      previousHash: lastChange.currentHash,
      currentHash,
    },
  });

  logger.info(`[WebChange] ${compName} (${label}): ${changeType} detected (${Math.round(changePct * 100)}% change)`);

  // Alert for major updates
  if (changeType === 'major_update') {
    await createAlert(
      compId,
      'website_change',
      'MEDIUM',
      `${compName} ${label}页面重大更新`,
      `页面内容变化 ${Math.round(changePct * 100)}%，可能涉及产品/运营策略调整`
    );
  }
}
```

**Step 2: Commit**

```bash
git add services/competitor-monitor/src/collectors/webchange.ts
git commit -m "feat: add website change detection collector"
```

---

## Task 5: News/RSS Collector

**Files:**
- Create: `services/competitor-monitor/src/collectors/news.ts`

**Step 1: Create src/collectors/news.ts**

```typescript
import Parser from 'rss-parser';
import { prisma } from '../index.js';
import { logger } from '../logger.js';
import { createAlert } from '../alerter.js';

const parser = new Parser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; POABot/1.0)',
  },
});

export async function collectCompetitorNews() {
  const competitors = await prisma.competitor.findMany({
    where: { enabled: true },
    select: { id: true, name: true, rssFeeds: true, keywords: true },
  });

  logger.info(`[News] Checking ${competitors.length} competitors...`);

  // Collect all RSS feeds
  const allFeeds: Array<{ compId: string; compName: string; url: string; label: string; keywords: string[] }> = [];

  for (const comp of competitors) {
    const feeds = comp.rssFeeds as Array<{ url: string; label: string }> || [];
    const keywords = comp.keywords as string[] || [];

    for (const feed of feeds) {
      allFeeds.push({
        compId: comp.id,
        compName: comp.name,
        url: feed.url,
        label: feed.label,
        keywords: [comp.name, ...keywords],
      });
    }
  }

  if (allFeeds.length === 0) {
    logger.info('[News] No RSS feeds configured');
    return;
  }

  for (const feed of allFeeds) {
    try {
      await collectFeed(feed);
    } catch (err: any) {
      logger.error(`[News] Feed ${feed.label} failed: ${err.message}`);
    }
  }
}

async function collectFeed(feed: {
  compId: string;
  compName: string;
  url: string;
  label: string;
  keywords: string[];
}) {
  let parsed;
  try {
    parsed = await parser.parseURL(feed.url);
  } catch (err: any) {
    logger.warn(`[News] Failed to parse RSS ${feed.label}: ${err.message}`);
    return;
  }

  const items = parsed.items || [];
  let newCount = 0;

  for (const item of items) {
    if (!item.title || !item.link) continue;

    // Check if item matches any keywords
    const text = `${item.title} ${item.contentSnippet || item.content || ''}`.toLowerCase();
    const matched = feed.keywords.some(kw => text.includes(kw.toLowerCase()));
    if (!matched) continue;

    // Skip if already collected
    try {
      await prisma.competitorNews.create({
        data: {
          competitorId: feed.compId,
          title: item.title,
          url: item.link,
          source: feed.label || parsed.title || 'RSS',
          summary: (item.contentSnippet || item.content || '').substring(0, 500),
          publishedAt: item.pubDate ? new Date(item.pubDate) : null,
        },
      });
      newCount++;

      // Simple high-impact keyword detection
      const highImpactTerms = ['融资', '收购', '合并', 'IPO', '上市', '裁员', '关闭',
        'funding', 'acquisition', 'merger', 'layoff', 'shutdown'];
      const isHighImpact = highImpactTerms.some(t => text.includes(t.toLowerCase()));

      if (isHighImpact) {
        await createAlert(
          feed.compId,
          'big_news',
          'HIGH',
          `${feed.compName} 重大新闻: ${item.title}`,
          (item.contentSnippet || '').substring(0, 200)
        );
      }
    } catch (err: any) {
      if (err.code === 'P2002') continue; // duplicate URL
      logger.warn(`[News] Failed to save news "${item.title}": ${err.message}`);
    }
  }

  if (newCount > 0) {
    logger.info(`[News] ${feed.compName} (${feed.label}): ${newCount} new articles`);
  }
}
```

**Step 2: Commit**

```bash
git add services/competitor-monitor/src/collectors/news.ts
git commit -m "feat: add news/RSS collector with keyword filtering and alerts"
```

---

## Task 6: Integrate Competitor Data into Insights Briefing

**Files:**
- Modify: `lib/insights/collector.ts`
- Modify: `app/api/insights/briefing/generate/route.ts`

**Step 1: Add competitor data collection to `lib/insights/collector.ts`**

Add this interface and function after the existing `collectDailyData` function (after line 273):

```typescript
export interface CompetitorDailyData {
  competitors: Array<{
    name: string;
    appSnapshots: Array<{ platform: string; rating: number | null; version: string | null; releaseNotes: string | null }>;
    reviewSummary: { total: number; avgRating: number | null; topIssues: string[] };
    webChanges: Array<{ url: string; changeType: string; summary: string | null }>;
    news: Array<{ title: string; source: string; summary: string | null }>;
  }>;
  alerts: Array<{ competitorName: string; alertType: string; severity: string; title: string; summary: string }>;
}

export async function collectCompetitorData(since?: Date): Promise<CompetitorDailyData> {
  const from = since || new Date(Date.now() - 24 * 60 * 60 * 1000);

  const competitors = await prisma.competitor.findMany({
    where: { enabled: true },
    select: { id: true, name: true },
  });

  const result: CompetitorDailyData = { competitors: [], alerts: [] };

  for (const comp of competitors) {
    const [snapshots, reviews, webChanges, news] = await Promise.all([
      prisma.competitorAppSnapshot.findMany({
        where: { competitorId: comp.id, createdAt: { gte: from } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.competitorReview.findMany({
        where: { competitorId: comp.id, createdAt: { gte: from } },
        select: { rating: true, tags: true },
      }),
      prisma.competitorWebChange.findMany({
        where: { competitorId: comp.id, createdAt: { gte: from }, changeType: { not: 'baseline' } },
      }),
      prisma.competitorNews.findMany({
        where: { competitorId: comp.id, createdAt: { gte: from } },
      }),
    ]);

    // Aggregate review issues
    const issueMap = new Map<string, number>();
    for (const r of reviews) {
      for (const tag of (r.tags as string[] || [])) {
        issueMap.set(tag, (issueMap.get(tag) || 0) + 1);
      }
    }
    const topIssues = Array.from(issueMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);

    const avgRating = reviews.length > 0
      ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10
      : null;

    // Only include competitor if there's any data
    if (snapshots.length > 0 || reviews.length > 0 || webChanges.length > 0 || news.length > 0) {
      result.competitors.push({
        name: comp.name,
        appSnapshots: snapshots.map(s => ({
          platform: s.platform,
          rating: s.rating,
          version: s.version,
          releaseNotes: s.releaseNotes,
        })),
        reviewSummary: { total: reviews.length, avgRating, topIssues },
        webChanges: webChanges.map(w => ({
          url: w.url,
          changeType: w.changeType,
          summary: w.summary,
        })),
        news: news.map(n => ({
          title: n.title,
          source: n.source,
          summary: n.summary,
        })),
      });
    }
  }

  // Collect recent alerts
  const alerts = await prisma.competitorAlert.findMany({
    where: { createdAt: { gte: from } },
    include: { competitor: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  result.alerts = alerts.map(a => ({
    competitorName: a.competitor.name,
    alertType: a.alertType,
    severity: a.severity,
    title: a.title,
    summary: a.summary,
  }));

  return result;
}
```

Also add `collectCompetitorData` to the existing `DailyData` interface by adding a `competitor` field. Add at line 37, inside the DailyData interface just before the closing `}`:

```typescript
  competitor?: CompetitorDailyData;
```

And in the `collectDailyData` function, call `collectCompetitorData` and attach it to the result. At the end of the function (before `return`), add:

```typescript
  // Collect competitor data (non-critical — if it fails, continue without it)
  try {
    const competitorData = await collectCompetitorData(from);
    return { ...result, competitor: competitorData };
  } catch (err) {
    console.error('[Collector] Competitor data collection failed:', err);
    return result;
  }
```

Actually, for simplicity, just store the result in a variable before returning, then add competitor data:

Replace the final `return { ... }` block. Instead, before the current return statement (approximately line 182), assign the result to a variable, add competitor data, then return.

**Step 2: Add competitor cards to briefing generation**

In `app/api/insights/briefing/generate/route.ts`, after the existing topic research loop (after line 113), add a block that creates competitor insight cards from the collected data:

Add after line 113 (after the `for (const topic of topics)` loop ends):

```typescript
    // 5. Generate competitor intelligence card (if data available)
    try {
      const { collectCompetitorData } = await import('@/lib/insights/collector');
      const competitorData = await collectCompetitorData();

      if (competitorData.competitors.length > 0) {
        const competitorContext = competitorData.competitors.map(c => {
          let text = `## ${c.name}\n`;
          if (c.appSnapshots.length > 0) {
            const latest = c.appSnapshots[0];
            text += `- 评分: ${latest.rating ?? 'N/A'}, 版本: ${latest.version ?? 'N/A'}\n`;
            if (latest.releaseNotes) text += `- 更新说明: ${latest.releaseNotes.substring(0, 200)}\n`;
          }
          if (c.reviewSummary.total > 0) {
            text += `- 新评论 ${c.reviewSummary.total} 条, 平均评分 ${c.reviewSummary.avgRating ?? 'N/A'}\n`;
            if (c.reviewSummary.topIssues.length > 0) text += `- 主要问题: ${c.reviewSummary.topIssues.join(', ')}\n`;
          }
          for (const wc of c.webChanges) {
            text += `- 网站变化: ${wc.summary}\n`;
          }
          for (const n of c.news) {
            text += `- 新闻: ${n.title} (${n.source})\n`;
          }
          return text;
        }).join('\n');

        if (competitorContext.trim()) {
          const { getOpenAIClient } = await import('@/lib/openai');
          const client = await getOpenAIClient();

          const response = await client.chat.completions.create({
            model: BRIEFING_MODEL,
            messages: [
              {
                role: 'system',
                content: `你是一位竞品情报分析师。根据以下竞品数据，生成一份简洁的竞品动态分析。
输出严格 JSON 格式：
{
  "title": "一句话标题，有信息量",
  "summary": "3-5句话核心要点",
  "details": "Markdown 格式的详细分析（200-400字），叙事式展开，提到具体竞品名、数据、时间",
  "impact": "对我们的影响（一句话）或 null",
  "action": "建议行动 或 null"
}`,
              },
              {
                role: 'user',
                content: `以下是过去 24 小时的竞品动态数据：\n\n${competitorContext}\n\n请分析并生成竞品情报卡片。`,
              },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.4,
            max_completion_tokens: 2000,
          });

          const content = response.choices[0]?.message?.content;
          if (content) {
            const parsed = JSON.parse(content);
            const card = await prisma.insightCard.create({
              data: {
                briefingId: briefing.id,
                category: 'competitor',
                priority: competitorData.alerts.length > 0 ? 'high' : 'medium',
                title: parsed.title || '竞品动态',
                summary: parsed.summary || '',
                details: parsed.details || '',
                impact: parsed.impact || null,
                action: parsed.action || null,
                sources: [],
              },
            });
            cards.push(card);
            console.log('[Briefing] Competitor intelligence card created');
          }
        }
      }
    } catch (error) {
      console.error('[Briefing] Competitor intelligence card failed:', error);
      // Non-critical — continue with briefing even if competitor card fails
    }
```

**Step 3: Commit**

```bash
git add lib/insights/collector.ts app/api/insights/briefing/generate/route.ts
git commit -m "feat: integrate competitor data into Insights Briefing pipeline"
```

---

## Task 7: Competitor CRUD API Routes

**Files:**
- Create: `app/api/competitors/route.ts` (GET list + POST create)
- Create: `app/api/competitors/[id]/route.ts` (GET detail + PUT update + DELETE)

**Step 1: Create app/api/competitors/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const competitors = await prisma.competitor.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          reviews: true,
          webChanges: true,
          news: true,
          alerts: { where: { acknowledged: false } },
        },
      },
    },
  });

  return NextResponse.json({ success: true, competitors });
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const body = await request.json();
  const { name, company, appStoreId, googlePlayId, websiteUrl, monitorUrls, rssFeeds, keywords } = body;

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: '竞品名称必填' }, { status: 400 });
  }

  const competitor = await prisma.competitor.create({
    data: {
      name: name.trim(),
      company: company?.trim() || null,
      appStoreId: appStoreId?.trim() || null,
      googlePlayId: googlePlayId?.trim() || null,
      websiteUrl: websiteUrl?.trim() || null,
      monitorUrls: monitorUrls || [],
      rssFeeds: rssFeeds || [],
      keywords: keywords || [],
    },
  });

  return NextResponse.json({ success: true, competitor });
}
```

**Step 2: Create app/api/competitors/[id]/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySession } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const { id } = await params;

  const competitor = await prisma.competitor.findUnique({
    where: { id },
    include: {
      appSnapshots: { orderBy: { createdAt: 'desc' }, take: 10 },
      webChanges: { orderBy: { createdAt: 'desc' }, take: 10 },
      news: { orderBy: { createdAt: 'desc' }, take: 10 },
      alerts: { orderBy: { createdAt: 'desc' }, take: 10 },
      _count: { select: { reviews: true, webChanges: true, news: true } },
    },
  });

  if (!competitor) {
    return NextResponse.json({ error: '竞品不存在' }, { status: 404 });
  }

  return NextResponse.json({ success: true, competitor });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { name, company, appStoreId, googlePlayId, websiteUrl, monitorUrls, rssFeeds, keywords, enabled } = body;

  const data: Record<string, any> = {};
  if (name !== undefined) data.name = name.trim();
  if (company !== undefined) data.company = company?.trim() || null;
  if (appStoreId !== undefined) data.appStoreId = appStoreId?.trim() || null;
  if (googlePlayId !== undefined) data.googlePlayId = googlePlayId?.trim() || null;
  if (websiteUrl !== undefined) data.websiteUrl = websiteUrl?.trim() || null;
  if (monitorUrls !== undefined) data.monitorUrls = monitorUrls;
  if (rssFeeds !== undefined) data.rssFeeds = rssFeeds;
  if (keywords !== undefined) data.keywords = keywords;
  if (enabled !== undefined) data.enabled = enabled;

  const competitor = await prisma.competitor.update({
    where: { id },
    data,
  });

  return NextResponse.json({ success: true, competitor });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get('session')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySession(token);
  if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const { id } = await params;

  await prisma.competitor.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
```

**Step 3: Commit**

```bash
git add app/api/competitors/
git commit -m "feat: add competitor CRUD API routes"
```

---

## Task 8: Competitor Management UI (Settings Tab)

**Files:**
- Create: `app/(dashboard)/insights/competitors/page.tsx`

This page is accessible from the Insights section and provides a management interface for competitors.

**Step 1: Create the competitor management page**

```tsx
'use client';

import { useState, useEffect } from 'react';
import {
  Typography, Box, Card, CardContent, Button, TextField, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Chip, Alert,
  CircularProgress, Switch, FormControlLabel, Divider, Grid,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';

interface Competitor {
  id: string;
  name: string;
  company: string | null;
  appStoreId: string | null;
  googlePlayId: string | null;
  websiteUrl: string | null;
  monitorUrls: Array<{ url: string; label: string }>;
  rssFeeds: Array<{ url: string; label: string }>;
  keywords: string[];
  enabled: boolean;
  createdAt: string;
  _count: { reviews: number; webChanges: number; news: number; alerts: number };
}

export default function CompetitorManagementPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', company: '', appStoreId: '', googlePlayId: '',
    websiteUrl: '', monitorUrls: '', rssFeeds: '', keywords: '',
  });

  const load = async () => {
    try {
      const res = await fetch('/api/competitors', { credentials: 'include' });
      const data = await res.json();
      if (data.success) setCompetitors(data.competitors);
    } catch {
      setError('加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: '', company: '', appStoreId: '', googlePlayId: '', websiteUrl: '', monitorUrls: '', rssFeeds: '', keywords: '' });
    setDialogOpen(true);
  };

  const openEdit = (c: Competitor) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      company: c.company || '',
      appStoreId: c.appStoreId || '',
      googlePlayId: c.googlePlayId || '',
      websiteUrl: c.websiteUrl || '',
      monitorUrls: (c.monitorUrls || []).map(u => `${u.label}|${u.url}`).join('\n'),
      rssFeeds: (c.rssFeeds || []).map(f => `${f.label}|${f.url}`).join('\n'),
      keywords: (c.keywords || []).join(', '),
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const body: any = {
      name: form.name,
      company: form.company || null,
      appStoreId: form.appStoreId || null,
      googlePlayId: form.googlePlayId || null,
      websiteUrl: form.websiteUrl || null,
      monitorUrls: form.monitorUrls.split('\n').filter(Boolean).map(line => {
        const [label, url] = line.split('|');
        return { label: label?.trim() || '', url: url?.trim() || label?.trim() || '' };
      }),
      rssFeeds: form.rssFeeds.split('\n').filter(Boolean).map(line => {
        const [label, url] = line.split('|');
        return { label: label?.trim() || '', url: url?.trim() || label?.trim() || '' };
      }),
      keywords: form.keywords.split(',').map(k => k.trim()).filter(Boolean),
    };

    const url = editingId ? `/api/competitors/${editingId}` : '/api/competitors';
    const method = editingId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setDialogOpen(false);
      load();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此竞品？所有相关数据将被清除。')) return;
    await fetch(`/api/competitors/${id}`, { method: 'DELETE', credentials: 'include' });
    load();
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await fetch(`/api/competitors/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ enabled }),
    });
    load();
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
        <Typography variant="h5">竞品管理</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button startIcon={<RefreshIcon />} onClick={load} variant="outlined" size="small">刷新</Button>
          <Button startIcon={<AddIcon />} onClick={openCreate} variant="contained" size="small">添加竞品</Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {competitors.length === 0 ? (
        <Card><CardContent>
          <Typography color="text.secondary" align="center">
            暂无竞品。点击"添加竞品"开始监控。
          </Typography>
        </CardContent></Card>
      ) : (
        <Grid container spacing={2}>
          {competitors.map(c => (
            <Grid key={c.id} size={{ xs: 12, md: 6 }}>
              <Card sx={{ opacity: c.enabled ? 1 : 0.6 }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="h6">{c.name}</Typography>
                    <Box>
                      <Switch checked={c.enabled} size="small" onChange={(_, v) => handleToggle(c.id, v)} />
                      <IconButton size="small" onClick={() => openEdit(c)}><EditIcon fontSize="small" /></IconButton>
                      <IconButton size="small" onClick={() => handleDelete(c.id)}><DeleteIcon fontSize="small" /></IconButton>
                    </Box>
                  </Box>
                  {c.company && <Typography variant="body2" color="text.secondary">{c.company}</Typography>}
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                    {c.appStoreId && <Chip label="App Store" size="small" color="primary" variant="outlined" />}
                    {c.googlePlayId && <Chip label="Google Play" size="small" color="success" variant="outlined" />}
                    {c.websiteUrl && <Chip label="官网" size="small" color="info" variant="outlined" />}
                    {(c.rssFeeds || []).length > 0 && <Chip label={`RSS x${(c.rssFeeds || []).length}`} size="small" variant="outlined" />}
                  </Box>
                  <Divider sx={{ my: 1 }} />
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    <Typography variant="caption" color="text.secondary">{c._count.reviews} 评论</Typography>
                    <Typography variant="caption" color="text.secondary">{c._count.webChanges} 网页变化</Typography>
                    <Typography variant="caption" color="text.secondary">{c._count.news} 新闻</Typography>
                    {c._count.alerts > 0 && <Chip label={`${c._count.alerts} 未处理告警`} size="small" color="warning" />}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? '编辑竞品' : '添加竞品'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label="名称 *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} size="small" />
            <TextField label="公司" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} size="small" />
            <TextField label="App Store ID" value={form.appStoreId} onChange={e => setForm({ ...form, appStoreId: e.target.value })} size="small" placeholder="如: 1517783697" />
            <TextField label="Google Play ID" value={form.googlePlayId} onChange={e => setForm({ ...form, googlePlayId: e.target.value })} size="small" placeholder="如: com.example.game" />
            <TextField label="官网 URL" value={form.websiteUrl} onChange={e => setForm({ ...form, websiteUrl: e.target.value })} size="small" placeholder="https://..." />
            <TextField label="额外监控 URL（每行一个, 格式: 标签|URL）" value={form.monitorUrls} onChange={e => setForm({ ...form, monitorUrls: e.target.value })} size="small" multiline rows={3} placeholder="公告页|https://example.com/news" />
            <TextField label="RSS 源（每行一个, 格式: 名称|URL）" value={form.rssFeeds} onChange={e => setForm({ ...form, rssFeeds: e.target.value })} size="small" multiline rows={3} placeholder="GameLook|https://www.gamelook.com.cn/feed" />
            <TextField label="搜索关键词（逗号分隔）" value={form.keywords} onChange={e => setForm({ ...form, keywords: e.target.value })} size="small" placeholder="原神, Genshin, miHoYo" />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>取消</Button>
          <Button onClick={handleSave} variant="contained" disabled={!form.name.trim()}>保存</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
```

**Step 2: Commit**

```bash
git add app/(dashboard)/insights/competitors/
git commit -m "feat: add competitor management UI page"
```

---

## Task 9: Add Competitor Entry to Insights Navigation

**Files:**
- Modify: `app/(dashboard)/insights/page.tsx` — add a "竞品监控" card/button linking to `/insights/competitors`

**Step 1: Add navigation button**

In `app/(dashboard)/insights/page.tsx`, find the hero buttons area (the Box with `display: 'flex', gap: 1, flexWrap: 'wrap'`). Add a new Button linking to competitor management:

```tsx
<Button
  variant="outlined"
  size="small"
  onClick={() => router.push('/insights/competitors')}
>
  竞品管理
</Button>
```

**Step 2: Commit**

```bash
git add app/(dashboard)/insights/page.tsx
git commit -m "feat: add competitor management link to Insights page"
```

---

## Task 10: Initialize Alerter in Service Entry Point

**Files:**
- Modify: `services/competitor-monitor/src/index.ts`

**Step 1: Import and init the alerter**

Add after `export const prisma = new PrismaClient();` line:

```typescript
import { initAlerter } from './alerter.js';
initAlerter(prisma);
```

**Step 2: Commit**

```bash
git add services/competitor-monitor/src/index.ts
git commit -m "fix: initialize alerter with Prisma client in competitor-monitor"
```

---

## Task 11: End-to-End Verification

**Step 1: Run Prisma generate to ensure client is up-to-date**

```bash
cd /Users/allenqiang/poamaster
npx prisma generate
```

**Step 2: Start the competitor-monitor service**

```bash
cd /Users/allenqiang/poamaster/services/competitor-monitor
npm install
npx tsx src/index.ts
```

Expected: Service starts, registers 3 jobs, no errors. Ctrl+C to stop.

**Step 3: Start dev server and verify the UI**

```bash
cd /Users/allenqiang/poamaster
npm run dev
```

Navigate to `http://localhost:3030/insights/competitors`. Expected: Page loads, shows "暂无竞品" message with "添加竞品" button.

**Step 4: Test competitor CRUD via API**

```bash
# Create a test competitor
curl -b "session=<your-session-token>" \
  -X POST http://localhost:3030/api/competitors \
  -H "Content-Type: application/json" \
  -d '{"name":"原神","company":"米哈游","appStoreId":"1517783697","googlePlayId":"com.miHoYo.GenshinImpact"}'

# List competitors
curl -b "session=<your-session-token>" http://localhost:3030/api/competitors
```

**Step 5: Test review collection with --run-now-reviews flag**

```bash
cd /Users/allenqiang/poamaster/services/competitor-monitor
npx tsx src/index.ts --run-now-reviews
```

Expected: Reviews collected for the test competitor, check database for `CompetitorReview` and `CompetitorAppSnapshot` records.

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat: competitor monitor v1 — review collection, web change detection, news/RSS, Insights integration"
```
