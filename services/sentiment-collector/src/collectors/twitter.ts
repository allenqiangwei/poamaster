import { Scraper, SearchMode } from '@the-convocation/twitter-scraper';
import initCycleTLS from 'cycletls';
import type { CycleTLSClient } from 'cycletls';
import { createDecipheriv } from 'crypto';
import { prisma } from '../index.js';
import { logger } from '../logger.js';
import { analyzeMention } from '../sentiment.js';

// Chrome 131 JA3 fingerprint
const CHROME_JA3 = '771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513,29-23-24,0';
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36';

// Reuse a single scraper instance across collection runs
let scraper: Scraper | null = null;
let loggedIn = false;
let cycleTLS: CycleTLSClient | null = null;

/** Decrypt AES-256-GCM value (mirrors lib/crypto.ts) */
function decryptValue(encryptedText: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not set');
  const key = Buffer.from(secret.padEnd(32, '0').slice(0, 32));
  const parts = encryptedText.split(':');
  if (parts.length !== 3) return encryptedText; // not encrypted
  const [ivHex, tagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function getXCredentials(): Promise<{ username: string; password: string; email: string } | null> {
  const [userCfg, passCfg, emailCfg] = await Promise.all([
    prisma.config.findUnique({ where: { key: 'x.username' } }),
    prisma.config.findUnique({ where: { key: 'x.password' } }),
    prisma.config.findUnique({ where: { key: 'x.email' } }),
  ]);
  if (!userCfg?.value || !passCfg?.value) return null;
  return {
    username: userCfg.value,
    password: decryptValue(passCfg.value),
    email: emailCfg?.value ? decryptValue(emailCfg.value) : '',
  };
}

/** Build a fetch-compatible wrapper using CycleTLS with proxy support */
function makeCycleTLSFetch(instance: CycleTLSClient, proxyUrl?: string) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as any).url;
    const method = (init?.method || 'GET').toUpperCase();

    const headers: Record<string, string> = {};
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => { headers[k] = v; });
      } else if (Array.isArray(init.headers)) {
        (init.headers as [string, string][]).forEach(([k, v]) => { headers[k] = v; });
      } else {
        Object.assign(headers, init.headers);
      }
    }

    const opts: any = {
      headers,
      ja3: CHROME_JA3,
      userAgent: headers['user-agent'] || CHROME_UA,
    };
    if (proxyUrl) opts.proxy = proxyUrl;
    if (init?.body) {
      opts.body = typeof init.body === 'string' ? init.body : String(init.body);
    }

    const resp = await instance(url, opts, method.toLowerCase() as any);

    const respHeaders = new Headers();
    if (resp.headers) {
      for (const [k, v] of Object.entries(resp.headers)) {
        if (Array.isArray(v)) v.forEach(val => respHeaders.append(k, val));
        else if (typeof v === 'string') respHeaders.set(k, v);
      }
    }

    let body = '';
    if (typeof resp.text === 'function') body = await resp.text();
    else if ((resp as any).body) body = String((resp as any).body);

    return new Response(body, { status: resp.status, headers: respHeaders });
  };
}

async function ensureLoggedIn(): Promise<Scraper | null> {
  const creds = await getXCredentials();
  if (!creds) {
    logger.warn('[Twitter] X credentials not configured, skipping');
    return null;
  }

  if (!scraper) {
    const proxyUrl = process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;

    // Initialize CycleTLS to bypass Cloudflare TLS fingerprinting
    if (!cycleTLS) {
      logger.info('[Twitter] Initializing CycleTLS...');
      cycleTLS = await initCycleTLS();
    }

    if (proxyUrl) logger.info(`[Twitter] Using proxy: ${proxyUrl}`);
    logger.info('[Twitter] Using CycleTLS (Chrome TLS fingerprint)');

    scraper = new Scraper({
      fetch: makeCycleTLSFetch(cycleTLS, proxyUrl) as any,
      experimental: {
        xClientTransactionId: true,
        xpff: true,
      },
    });
  }

  if (!loggedIn || !(await scraper.isLoggedIn())) {
    logger.info('[Twitter] Logging in...');
    try {
      await scraper.login(creds.username, creds.password, creds.email || undefined);
      loggedIn = true;
      logger.info('[Twitter] Login successful');
    } catch (error: any) {
      const msg = error.message || '';
      if (msg.includes('403')) {
        logger.error('[Twitter] Login failed: Cloudflare 403 — proxy IP may be blocked. Try a residential proxy.');
      } else {
        logger.error('[Twitter] Login failed:', msg);
      }
      loggedIn = false;
      return null;
    }
  }

  return scraper;
}

export async function collectAllTweets() {
  const s = await ensureLoggedIn();
  if (!s) return;

  const games = await prisma.monitoredGame.findMany({
    where: { isActive: true, xKeywords: { isEmpty: false } },
    select: { id: true, name: true, xKeywords: true },
  });

  logger.info(`[Twitter] Collecting mentions for ${games.length} games...`);

  for (const game of games) {
    try {
      await collectGameMentions(s, game.id, game.name, game.xKeywords);
    } catch (error: any) {
      logger.error(`[Twitter] Failed for ${game.name}:`, error.message);
    }
  }
}

async function collectGameMentions(
  s: Scraper,
  gameId: string,
  gameName: string,
  keywords: string[],
) {
  let newCount = 0;

  for (const keyword of keywords) {
    try {
      const tweets = s.searchTweets(keyword, 50, SearchMode.Latest);

      for await (const tweet of tweets) {
        if (!tweet.id || !tweet.text) continue;
        // Skip retweets — they're duplicates
        if (tweet.isRetweet) continue;

        try {
          const content = tweet.text.replace(/\0/g, ''); // strip null bytes
          const sentiment = analyzeMention(content);
          const engagement = {
            likes: tweet.likes ?? 0,
            retweets: tweet.retweets ?? 0,
            replies: tweet.replies ?? 0,
            views: tweet.views ?? 0,
          };

          await prisma.sentimentMention.create({
            data: {
              gameId,
              platform: 'X',
              externalId: tweet.id,
              author: tweet.username || null,
              authorFollowers: null,
              content,
              url: tweet.permanentUrl || null,
              sentimentScore: sentiment.sentimentScore,
              sentimentLabel: sentiment.sentimentLabel,
              keyIssues: sentiment.keyIssues,
              engagement,
              publishedAt: tweet.timeParsed ?? new Date(),
            },
          });
          newCount++;
        } catch (error: any) {
          if (error.code === 'P2002') continue; // duplicate
          throw error;
        }
      }
    } catch (error: any) {
      logger.warn(`[Twitter] Keyword "${keyword}" failed for ${gameName}:`, error.message);
    }
  }

  logger.info(`[Twitter] ${gameName}: ${newCount} new mentions`);
}
