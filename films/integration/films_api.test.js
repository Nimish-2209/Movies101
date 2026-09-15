const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

process.env.JWT_SECRET = 'integration-test-secret';

const app = require('../app');
const Film = require('../src/models/film_model');

const mongoUri = process.env.MONGO_TEST_URI ||
  'mongodb://127.0.0.1:27017/movies101_integration_test';
const catalog = app._router.stack
  .find((layer) => layer.handle && layer.handle.lookupMovie)
  .handle;

let server;
let baseUrl;
let originalLookup;

async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  return {
    status: response.status,
    data: text ? JSON.parse(text) : null
  };
}

async function register(username) {
  const response = await request('/api/v1/register', {
    method: 'POST',
    body: { username, password: 'password123' }
  });
  assert.equal(response.status, 201);
  return response.data.token;
}

before(async () => {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
  await mongoose.connection.dropDatabase();

  originalLookup = catalog.lookupMovie;
  catalog.lookupMovie = async (id) => ({
    id,
    title: id === 329865 ? 'Arrival' : 'The Batman',
    releaseDate: id === 329865 ? '2016-11-11' : '2022-03-01',
    posterUrl: 'https://image.example/' + id + '.jpg'
  });

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = 'http://127.0.0.1:' + server.address().port;
});

after(async () => {
  catalog.lookupMovie = originalLookup;
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('ownership, duplicate ratings, community averages, and bulk updates', async () => {
  const aliceToken = await register('Alice');
  const bobToken = await register('Bob');

  const firstRating = await request('/api/v1/films', {
    method: 'POST',
    token: aliceToken,
    body: { tmdbId: 329865, rating: 8 }
  });
  assert.equal(firstRating.status, 201);

  const rerating = await request('/api/v1/films', {
    method: 'POST',
    token: aliceToken,
    body: { tmdbId: 329865, rating: 9 }
  });
  assert.equal(rerating.status, 200);
  assert.equal(await Film.countDocuments({ ownerKey: 'alice' }), 1);

  const bobRating = await request('/api/v1/films', {
    method: 'POST',
    token: bobToken,
    body: { tmdbId: 329865, rating: 5 }
  });
  assert.equal(bobRating.status, 201);

  const community = await request('/api/v1/films');
  assert.equal(community.status, 200);
  assert.equal(community.data.length, 1);
  assert.equal(community.data[0].rating, 7);
  assert.equal(community.data[0].ratingCount, 2);

  const forbiddenUpdate = await request(
    '/api/v1/films/' + firstRating.data._id,
    {
      method: 'PATCH',
      token: bobToken,
      body: { favorite: true }
    }
  );
  assert.equal(forbiddenUpdate.status, 403);

  const watchlist = await request('/api/v1/films', {
    method: 'POST',
    token: aliceToken,
    body: { tmdbId: 414906 }
  });
  assert.equal(watchlist.status, 201);
  assert.equal(watchlist.data.rating, undefined);
  assert.equal(watchlist.data.watched, false);

  const bulkUpdate = await request('/api/v1/films/ratings', {
    method: 'PUT',
    token: aliceToken,
    body: {
      updates: [
        { id: firstRating.data._id, rating: 10 },
        { id: watchlist.data._id, rating: 8 }
      ]
    }
  });
  assert.equal(bulkUpdate.status, 200);
  assert.equal(bulkUpdate.data.updatedCount, 2);

  const mine = await request('/api/v1/films/mine', {
    token: aliceToken
  });
  assert.equal(mine.status, 200);
  assert.deepEqual(
    mine.data.map((film) => [film.name, film.rating, film.watched]),
    [
      ['Arrival', 10, true],
      ['The Batman', 8, true]
    ]
  );
});
