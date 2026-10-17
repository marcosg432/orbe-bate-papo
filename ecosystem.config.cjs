module.exports = {
  apps: [
    {
      name: 'orbe',
      cwd: __dirname + '/server',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: '3041',
        CLIENT_ORIGIN: 'http://127.0.0.1:3041',
        COOKIE_SECURE: 'false',
        COOKIE_SAMESITE: 'lax',
        TRUST_PROXY: 'true',
        RATE_LIMIT_ENABLED: 'true',
      },
    },
  ],
};
