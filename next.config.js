/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb'
    },
    // Configure proxy/Route Handler max body size (50MB in bytes)
    // This is the correct config for Next.js 16+
    proxyClientMaxBodySize: 52428800
  }
};

module.exports = nextConfig;
