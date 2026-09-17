import type { Server } from 'node:http';
import mongoose from 'mongoose';
import app from './app';
import { DB_URI, SHUTDOWN_TIMEOUT_MS } from './config';
import { createShutdownHandler } from './shutdown';

const port = Number(process.env.PORT ?? 3000);

export async function start(): Promise<Server> {
  await mongoose.connect(DB_URI);

  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`Films API listening on port ${port}`);
      resolve(server);
    });
    server.once('error', reject);
  });
}

if (require.main === module) {
  start()
    .then((server) => {
      const shutdown = createShutdownHandler({
        server,
        closeDatabase: () => mongoose.disconnect(),
        timeoutMs: SHUTDOWN_TIMEOUT_MS
      });
      process.once('SIGTERM', () => void shutdown('SIGTERM'));
      process.once('SIGINT', () => void shutdown('SIGINT'));
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Films API could not start:', message);
      process.exit(1);
    });
}
