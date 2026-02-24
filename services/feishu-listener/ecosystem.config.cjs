const { resolve } = require('path');

module.exports = {
  apps: [
    {
      name: 'feishu-listener',
      script: resolve(__dirname, 'src/index.ts'),
      interpreter: resolve(__dirname, 'node_modules/.bin/tsx'),
      cwd: __dirname,
      // Fork mode (required for tsx)
      exec_mode: 'fork',
      instances: 1,
      // Restart policy
      autorestart: true,
      max_restarts: 50,
      min_uptime: '10s',
      restart_delay: 5000,
      // Logging
      error_file: resolve(__dirname, 'logs/error.log'),
      out_file: resolve(__dirname, 'logs/out.log'),
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      // Environment
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
