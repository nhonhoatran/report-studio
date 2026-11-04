import { createApp } from './app.js';
import { config } from './config.js';
import { metaPool, migrate, seedAdmin } from './db/metadata.js';
import { logger } from './lib/logger.js';
import { closeAllPools } from './query/executor.js';

async function main() {
  await migrate();
  await seedAdmin();
  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    logger.info({ port: config.port, host: config.host, env: config.isProd ? 'production' : 'development' }, 'report-studio server listening');
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close(async () => {
      await closeAllPools();
      await metaPool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
