/**
 * NetArch server entrypoint.
 */
import { loadConfig } from './config/index.js';
import { startServer } from './api/server.js';

const config = loadConfig();
startServer(config).catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
