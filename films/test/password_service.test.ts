import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, verifyPassword } from '../src/services/password_service';

test('passwords are salted and never stored as plaintext', async () => {
  const password = 'correct horse battery staple';
  const firstHash = await hashPassword(password);
  const secondHash = await hashPassword(password);

  assert.notEqual(firstHash, secondHash);
  assert.equal(firstHash.includes(password), false);
  assert.equal(await verifyPassword(password, firstHash), true);
});

test('an incorrect password does not verify', async () => {
  const passwordHash = await hashPassword('correct horse battery staple');

  assert.equal(await verifyPassword('wrong password', passwordHash), false);
  assert.equal(await verifyPassword('wrong password', 'invalid-hash'), false);
});
