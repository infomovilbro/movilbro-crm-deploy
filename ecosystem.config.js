module.exports = {
  apps: [{
    name: 'movilbro-crm',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    max_memory_restart: '512M',
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_restarts: 10,
    restart_delay: 5000
  }]
};
