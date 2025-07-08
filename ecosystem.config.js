module.exports = {
  apps: [{
    name: 'flowmatic-r2c',
    script: 'server.js',
    cwd: '/home/subhash.thakur.india/flowmatic-dev/r2c',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 8080
    },
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    time: true
  }]
};
