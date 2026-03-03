module.exports = {
  apps: [
    {
      name: 'clearsun-wa',
      script: 'index.js',
      cwd: '/home/ubuntu/clearsun-wa',
      node_args: '--max-old-space-size=512 --expose-gc', // M4: --expose-gc enables global.gc() post-OCR
      autorestart: true,
      watch: false,
      env_file: '/home/ubuntu/clearsun-wa/.env',
      max_memory_restart: '500M', // M4: lowered from 900M — catches real leaks faster

      // ── Restart storm protection ──────────────────────────────────────────
      // If the process dies repeatedly, slow the restart loop so we don't thrash.
      restart_delay: 5000,
      exp_backoff_restart_delay: 2000,
      min_uptime: 10000,
      max_restarts: 30,
      env: {
        PHONE_NUMBER: '27822128758', // update if SIM number changes
        NODE_ENV: 'production',
        TZ: 'Africa/Johannesburg',
        DIGEST_HOUR: '17',
        ALERT_COOLDOWN_MIN: '30',
        ALLOW_FROM_ME: '1',
        HEAP_LOG: '1',
        SHEET_ID: '1yd_Zd2akUwSNoN0pHH0qLsmAT7Mxg7Nw81qYIulD-W4',
      },
    },
  ],
};
