import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import app from '../src/app';
import User from '../src/models/user_model';

let server: Server;
let baseUrl: string;
const originalFindOne = User.findOne;

before(async () => {
  Object.assign(User, {
    findOne: () => ({ select: async () => null })
  });
  server = await new Promise<Server>((resolve) => {
    const listeningServer = app.listen(0, '127.0.0.1', () => {
      resolve(listeningServer);
    });
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  Object.assign(User, { findOne: originalFindOne });
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function authRequest(path: '/api/v1/login' | '/api/v1/register') {
  return fetch(baseUrl + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Alice', password: 'password123' })
  });
}

test('auth endpoints share an IP rate limit before expensive work', async () => {
  assert.equal((await authRequest('/api/v1/login')).status, 401);
  assert.equal((await authRequest('/api/v1/login')).status, 401);

  const blockedLogin = await authRequest('/api/v1/login');
  assert.equal(blockedLogin.status, 429);
  assert.ok(blockedLogin.headers.get('retry-after'));
  assert.ok(blockedLogin.headers.get('ratelimit'));
  assert.match(
    ((await blockedLogin.json()) as { error: string }).error,
    /too many/i
  );

  assert.equal((await authRequest('/api/v1/register')).status, 429);
});
