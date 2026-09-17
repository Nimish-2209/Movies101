import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import app, { aiRecommender, movieCatalog } from '../src/app';
import Film from '../src/models/film_model';
import User from '../src/models/user_model';

interface AuthResponse {
  token: string;
}

interface FilmResponse {
  _id: string;
  name: string;
  rating?: number;
  watched: boolean;
}

interface CommunityFilm {
  rating: number;
  ratingCount: number;
}

interface BulkResponse {
  updatedCount: number;
}

interface RequestOptions {
  method?: string;
  token?: string;
  body?: unknown;
}

const mongoUri =
  process.env.MONGO_TEST_URI ??
  'mongodb://127.0.0.1:27017/movies101_integration_test';

let server: Server;
let baseUrl: string;
const originalLookup = movieCatalog.lookupMovie;
const originalSearch = movieCatalog.searchMovies;
const originalRecommend = aiRecommender.recommend;

async function request<T>(
  path: string,
  { method = 'GET', token, body }: RequestOptions = {}
): Promise<{ status: number; data: T }> {
  const response = await fetch(baseUrl + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  return {
    status: response.status,
    data: (text ? JSON.parse(text) : null) as T
  };
}

async function register(username: string): Promise<string> {
  const response = await request<AuthResponse>('/api/v1/register', {
    method: 'POST',
    body: { username, password: 'password123' }
  });
  assert.equal(response.status, 201);
  return response.data.token;
}

before(async () => {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
  await mongoose.connection.dropDatabase();
  await Promise.all([Film.syncIndexes(), User.syncIndexes()]);

  movieCatalog.lookupMovie = async (id) => ({
    id,
    title: id === 329865 ? 'Arrival' : 'The Batman',
    releaseDate: id === 329865 ? '2016-11-11' : '2022-03-01',
    posterUrl: `https://image.example/${id}.jpg`,
    overview: ''
  });
  movieCatalog.searchMovies = async (query) =>
    query === 'Moon'
      ? [
          {
            id: 17431,
            title: 'Moon',
            releaseDate: '2009-06-12',
            posterUrl: 'https://image.example/moon.jpg',
            overview: ''
          }
        ]
      : [];
  aiRecommender.recommend = async () => ({
    reply: 'Moon is ready for lift-off.',
    candidates: [
      {
        title: 'Moon',
        releaseYear: 2009,
        reason: 'A smart, quiet space mystery.'
      }
    ]
  });

  server = await new Promise<Server>((resolve) => {
    const listeningServer = app.listen(0, '127.0.0.1', () => {
      resolve(listeningServer);
    });
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  movieCatalog.lookupMovie = originalLookup;
  movieCatalog.searchMovies = originalSearch;
  aiRecommender.recommend = originalRecommend;
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('atomic upserts, ownership, community averages, and bulk updates', async () => {
  const aliceToken = await register('Alice');
  const bobToken = await register('Bob');

  const duplicateRegistration = await request<AuthResponse>(
    '/api/v1/register',
    {
      method: 'POST',
      body: { username: 'Alice', password: 'different-password' }
    }
  );
  assert.equal(duplicateRegistration.status, 409);
  assert.equal(await User.countDocuments({ usernameKey: 'alice' }), 1);

  const concurrentRegistrations = await Promise.all(
    ['first', 'second'].map(() =>
      request<AuthResponse>('/api/v1/register', {
        method: 'POST',
        body: { username: 'Charlie', password: 'password123' }
      })
    )
  );
  assert.deepEqual(
    concurrentRegistrations.map(({ status }) => status).sort(),
    [201, 409]
  );
  assert.equal(await User.countDocuments({ usernameKey: 'charlie' }), 1);

  const firstRating = await request<FilmResponse>('/api/v1/films', {
    method: 'POST',
    token: aliceToken,
    body: { tmdbId: 329865, rating: 8 }
  });
  assert.equal(firstRating.status, 201);

  const rerating = await request<FilmResponse>('/api/v1/films', {
    method: 'POST',
    token: aliceToken,
    body: { tmdbId: 329865, rating: 9 }
  });
  assert.equal(rerating.status, 200);
  assert.equal(await Film.countDocuments({ ownerKey: 'alice' }), 1);

  const bobRating = await request<FilmResponse>('/api/v1/films', {
    method: 'POST',
    token: bobToken,
    body: { tmdbId: 329865, rating: 5 }
  });
  assert.equal(bobRating.status, 201);

  const community = await request<CommunityFilm[]>('/api/v1/films');
  assert.equal(community.status, 200);
  assert.equal(community.data.length, 1);
  assert.equal(community.data[0].rating, 7);
  assert.equal(community.data[0].ratingCount, 2);

  const forbiddenUpdate = await request<FilmResponse>(
    `/api/v1/films/${firstRating.data._id}`,
    {
      method: 'PATCH',
      token: bobToken,
      body: { favorite: true }
    }
  );
  assert.equal(forbiddenUpdate.status, 403);

  const watchlist = await request<FilmResponse>('/api/v1/films', {
    method: 'POST',
    token: aliceToken,
    body: { tmdbId: 414906 }
  });
  assert.equal(watchlist.status, 201);
  assert.equal(watchlist.data.rating, undefined);
  assert.equal(watchlist.data.watched, false);

  const duplicateWatchlist = await request<FilmResponse>('/api/v1/films', {
    method: 'POST',
    token: aliceToken,
    body: { tmdbId: 414906 }
  });
  assert.equal(duplicateWatchlist.status, 409);
  assert.equal(
    await Film.countDocuments({ ownerKey: 'alice', nameKey: 'tmdb:414906' }),
    1
  );

  const bulkUpdate = await request<BulkResponse>('/api/v1/films/ratings', {
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

  const mine = await request<FilmResponse[]>('/api/v1/films/mine', {
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

  const assistant = await request<{
    reply: string;
    recommendations: Array<{ id: number; title: string }>;
  }>('/api/v1/assistant', {
    method: 'POST',
    token: aliceToken,
    body: {
      messages: [{ role: 'user', content: 'Give me thoughtful sci-fi.' }]
    }
  });
  assert.equal(assistant.status, 200);
  assert.equal(assistant.data.reply, 'Moon is ready for lift-off.');
  assert.deepEqual(
    assistant.data.recommendations.map(({ id, title }) => ({ id, title })),
    [{ id: 17431, title: 'Moon' }]
  );
});
