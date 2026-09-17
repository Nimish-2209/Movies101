import type { Server } from 'node:http';

export type ShutdownSignal = 'SIGINT' | 'SIGTERM';

interface ShutdownOptions {
  server: Server;
  closeDatabase: () => Promise<void>;
  timeoutMs: number;
  logger?: Pick<Console, 'error' | 'log'>;
  exit?: (code: number) => void;
}

export function createShutdownHandler({
  server,
  closeDatabase,
  timeoutMs,
  logger = console,
  exit = process.exit
}: ShutdownOptions): (signal: ShutdownSignal) => Promise<void> {
  let shutdownPromise: Promise<void> | undefined;

  return (signal) => {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = (async () => {
      logger.log(`Received ${signal}; draining HTTP requests.`);
      const forceShutdown = setTimeout(() => {
        logger.error(
          `Graceful shutdown exceeded ${timeoutMs}ms; forcing exit.`
        );
        server.closeAllConnections();
        exit(1);
      }, timeoutMs);
      forceShutdown.unref();

      try {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
        logger.log('HTTP server closed.');

        await closeDatabase();
        logger.log('MongoDB connection closed.');
      } catch (error) {
        server.closeAllConnections();
        logger.error('Graceful shutdown failed:', error);
        exit(1);
      } finally {
        clearTimeout(forceShutdown);
      }
    })();

    return shutdownPromise;
  };
}
