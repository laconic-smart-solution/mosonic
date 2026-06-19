module.exports = {
  apps: [
    {
      name: 'neutral-tex',
      script: './node_modules/serve/build/main.js',
      args: '-s dist -l 4002',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      }
    }
  ]
};