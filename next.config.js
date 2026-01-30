/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb'
    }
  },
  // 增加 API 路由的请求体大小限制
  api: {
    bodyParser: {
      sizeLimit: '50mb'
    }
  }
};

module.exports = nextConfig;
