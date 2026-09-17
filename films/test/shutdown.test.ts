import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { test } from 'node:test';
import { createShutdownHandler } from '../src/shutdown';

test('shutdown is idempotent and closes HTTP before MongoDB', async () => {
  const events: string[] = [];
  const server = {
    close: (callback: (error?: Error) => void) => {
      events.push('http');
      callback();
    },
    closeAllConnections: () => events.push('force')
  } as unknown as Server;
  const logger = {
    log: (message: string) => events.push(message),
    error: (message: string) => events.push(message)
  };
  const shutdown = createShutdownHandler({
    server,
    closeDatabase: async () => {
      events.push('database');
    },
    timeoutMs: 1000,
    logger
  });

  const first = shutdown('SIGTERM');
  const second = shutdown('SIGINT');
  assert.strictEqual(first, second);
  await first;

  assert.deepEqual(events, [
    'Received SIGTERM; draining HTTP requests.',
    'http',
    'HTTP server closed.',
    'database',
    'MongoDB connection closed.'
  ]);
});
