import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import jwt from 'jsonwebtoken';
import app, { movieCatalog } from '../src/app';
import Film, { type FilmDocument } from '../src/models/film_model';
import type { Movie } from '../src/services/movie_catalog';

const SECRET = 'test-only-secret';
const token = jwt.sign(
  { user: { id: 'test-user', username: 'Alice', usernameKey: 'alice' } },
  SECRET
);

let server: Server;
let baseUrl: string;

before(async () => {
  server = await new Promise<Server>((resolve) => {
    const listeningServer = app.listen(0, '127.0.0.1', () => {
      resolve(listeningServer);
    });
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function invoke(body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/api/v1/films`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  return {
    status: response.status,
    data: (await response.json()) as Record<string, unknown>
  };
}

function movie(id: number, title: string): Movie {
  return {
    id,
    title,
    releaseDate: title === 'Arrival' ? '2016-11-11' : '2022-03-01',
    posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
    overview: ''
  };
}

function filmDocument(
  name: string,
  tmdbId: number,
  rating?: number
): FilmDocument {
  return new Film({
    name,
    nameKey: `tmdb:${tmdbId}`,
    tmdbId,
    releaseDate: name === 'Arrival' ? '2016-11-11' : '2022-03-01',
    posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
    rating,
    watched: rating !== undefined,
    favorite: false,
    owner: 'Alice',
    ownerKey: 'alice'
  });
}

test('rating inserts verified identity with one atomic database command', async () => {
  const oldLookup = movieCatalog.lookupMovie;
  const oldUpsert = Film.findOneAndUpdate;
  let calls = 0;
  let capturedUpdate: Record<string, unknown> = {};

  try {
    movieCatalog.lookupMovie = async (id) => movie(id, 'The Batman');
    Object.assign(Film, {
      findOneAndUpdate: async (
        _filter: unknown,
        update: Record<string, unknown>
      ) => {
        calls += 1;
        capturedUpdate = update;
        return {
          value: filmDocument('The Batman', 414906, 8),
          lastErrorObject: { updatedExisting: false }
        };
      }
    });

    const response = await invoke({
      tmdbId: 414906,
      name: 'Fake Title',
      rating: 8
    });
    const setOnInsert = capturedUpdate.$setOnInsert as Record<string, unknown>;
    const set = capturedUpdate.$set as Record<string, unknown>;

    assert.equal(response.status, 201);
    assert.equal(calls, 1);
    assert.equal(setOnInsert.name, 'The Batman');
    assert.equal(setOnInsert.nameKey, 'tmdb:414906');
    assert.equal(set.rating, 8);
    assert.equal(set.watched, true);
    assert.equal(response.data.name, 'The Batman');
    assert.equal(response.data.tmdbId, 414906);
  } finally {
    movieCatalog.lookupMovie = oldLookup;
    Object.assign(Film, { findOneAndUpdate: oldUpsert });
  }
});

test('watchlist inserts without inventing a rating', async () => {
  const oldLookup = movieCatalog.lookupMovie;
  const oldUpsert = Film.findOneAndUpdate;
  let capturedUpdate: Record<string, unknown> = {};

  try {
    movieCatalog.lookupMovie = async (id) => movie(id, 'Arrival');
    Object.assign(Film, {
      findOneAndUpdate: async (
        _filter: unknown,
        update: Record<string, unknown>
      ) => {
        capturedUpdate = update;
        return {
          value: filmDocument('Arrival', 329865),
          lastErrorObject: { updatedExisting: false }
        };
      }
    });

    const response = await invoke({ tmdbId: 329865 });
    const setOnInsert = capturedUpdate.$setOnInsert as Record<string, unknown>;

    assert.equal(response.status, 201);
    assert.equal(capturedUpdate.$set, undefined);
    assert.equal(setOnInsert.watched, false);
    assert.equal(response.data.name, 'Arrival');
    assert.equal(response.data.rating, undefined);
    assert.equal(response.data.watched, false);
  } finally {
    movieCatalog.lookupMovie = oldLookup;
    Object.assign(Film, { findOneAndUpdate: oldUpsert });
  }
});

test('rating an existing watchlist movie updates it atomically', async () => {
  const oldLookup = movieCatalog.lookupMovie;
  const oldUpsert = Film.findOneAndUpdate;
  try {
    movieCatalog.lookupMovie = async (id) => movie(id, 'Arrival');
    Object.assign(Film, {
      findOneAndUpdate: async () => ({
        value: filmDocument('Arrival', 329865, 9),
        lastErrorObject: { updatedExisting: true }
      })
    });

    const response = await invoke({ tmdbId: 329865, rating: 9 });
    assert.equal(response.status, 200);
    assert.equal(response.data.rating, 9);
    assert.equal(response.data.watched, true);
  } finally {
    movieCatalog.lookupMovie = oldLookup;
    Object.assign(Film, { findOneAndUpdate: oldUpsert });
  }
});

test('adding an existing watchlist movie returns a conflict', async () => {
  const oldLookup = movieCatalog.lookupMovie;
  const oldUpsert = Film.findOneAndUpdate;
  try {
    movieCatalog.lookupMovie = async (id) => movie(id, 'Arrival');
    Object.assign(Film, {
      findOneAndUpdate: async () => ({
        value: filmDocument('Arrival', 329865),
        lastErrorObject: { updatedExisting: true }
      })
    });

    assert.equal((await invoke({ tmdbId: 329865 })).status, 409);
  } finally {
    movieCatalog.lookupMovie = oldLookup;
    Object.assign(Film, { findOneAndUpdate: oldUpsert });
  }
});

test('rating requires a valid TMDB ID', async () => {
  assert.equal((await invoke({ name: 'Anything', rating: 8 })).status, 400);
  assert.equal((await invoke({ tmdbId: 0, rating: 8 })).status, 400);
  assert.equal((await invoke({ tmdbId: 414906, rating: false })).status, 400);
});

test('unverified movie cannot be saved', async () => {
  const oldLookup = movieCatalog.lookupMovie;
  try {
    movieCatalog.lookupMovie = async () => {
      throw Object.assign(new Error('Not found'), { status: 404 });
    };
    const response = await invoke({ tmdbId: 999999999, rating: 8 });
    assert.equal(response.status, 404);
    assert.match(String(response.data.error), /not found/i);
  } finally {
    movieCatalog.lookupMovie = oldLookup;
  }
});
