// Save Feishu Open API credentials to config
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { createCipheriv, createDecipheriv, randomBytes } = require('crypto');

const prisma = new PrismaClient();

const SECRET = process.env.SESSION_SECRET;
function encrypt(text) {
  const iv = randomBytes(16);
  // Match lib/crypto.ts key derivation: padEnd(32, '0').slice(0, 32) as raw string
  const key = Buffer.from(SECRET.padEnd(32, '0').slice(0, 32));
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

(async () => {
  // Save app_id (not sensitive, plain text)
  await prisma.config.upsert({
    where: { key: 'feishu.appId' },
    create: { key: 'feishu.appId', value: 'cli_a9f2812a66f89bd2' },
    update: { value: 'cli_a9f2812a66f89bd2' },
  });
  console.log('Saved feishu.appId');

  // Save app_secret (sensitive, encrypted)
  await prisma.config.upsert({
    where: { key: 'feishu.appSecret' },
    create: { key: 'feishu.appSecret', value: encrypt('ErUqd6qZHszZSlLJIhzz6gmV4mE53hju') },
    update: { value: encrypt('ErUqd6qZHszZSlLJIhzz6gmV4mE53hju') },
  });
  console.log('Saved feishu.appSecret (encrypted)');

  await prisma.$disconnect();
})();
