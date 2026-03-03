module.exports = {
  apps: [{
    name: 'clearsun-dashboard',
    script: 'node_modules/.bin/next',
    args: 'start',
    cwd: '/home/ubuntu/clearsun-dashboard',
    env: {
      PORT: '3002',
      NODE_ENV: 'production'
    },
    max_memory_restart: '400M',
  }]
}
