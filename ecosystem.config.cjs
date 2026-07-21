const path = require('node:path');

const appDir = __dirname;
const logDir = path.join(appDir, 'logs');

module.exports = {
  apps: [
    {
      name: 'furby-open',
      cwd: appDir,
      script: 'node',
      args: '--import tsx/esm src/index.ts',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        FURBY_OPEN_ROOT_DIR: appDir,
      },
      error_file: path.join(logDir, 'pm2-error.log'),
      out_file: path.join(logDir, 'pm2-out.log'),
      log_file: path.join(logDir, 'furby-open.log'),
      time: true,
    },
  ],
};
