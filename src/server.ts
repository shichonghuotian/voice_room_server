/**
 * Entry point — loads .env before importing anything else.
 * Use this instead of app.ts when running directly.
 */
import { config } from './config';
config.load();

// Now import app (which triggers all other imports with env vars set)
import('./app').then(({ default: _app }) => {
  // app.ts handles server startup in require.main === module check
  // but since we're using dynamic import, we need to trigger it manually
}).catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
