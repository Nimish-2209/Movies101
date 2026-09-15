const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hashPassword,
  verifyPassword
} = require('../src/services/password_service');

test('passwords are salted and never stored as plaintext', async() => {
  const firstHash = await hashPassword('correct horse battery staple');
  const secondHash = await hashPassword('correct horse battery staple');

  assert.notEqual(firstHash, secondHash);
  assert.equal(firstHash.includes('correct horse battery staple'), false);
  assert.equal(await verifyPassword('correct horse battery staple', firstHash), true);
});

test('an incorrect password does not verify', async() => {
  const passwordHash = await hashPassword('correct horse battery staple');

  assert.equal(await verifyPassword('wrong password', passwordHash), false);
  assert.equal(await verifyPassword('wrong password', 'invalid-hash'), false);
});
