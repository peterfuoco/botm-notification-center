import { existsSync } from 'node:fs';
import { createApp } from './app.js';
import { loadConfig } from './config/config.js';
import { systemClock } from './lib/clock.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const config = loadConfig();
const app = createApp({ clock: systemClock });

app.on('error', (err: unknown) => {
  console.error('Unhandled error', err);
});

const server = app.listen(config.port, () => {
  console.log(`Notification center listening on :${config.port}`);
});

const shutdown = (): void => {
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
