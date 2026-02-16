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
