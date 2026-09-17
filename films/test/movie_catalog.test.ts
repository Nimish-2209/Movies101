import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import express from 'express';
import {
  createMovieRouter,
  type Movie,
  type MovieRouter
} from '../src/services/movie_catalog';

interface ListResponse {
  results: Movie[];
}

async function call(
  router: MovieRouter,
  path: string
): Promise<{ status: number; body: unknown }> {
  const app = express();
  app.use(router);
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listeningServer = app.listen(0, '127.0.0.1', () => {
      resolve(listeningServer);
    });
  });

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('missing credentials return a helpful unavailable response', async () => {
  const result = await call(createMovieRouter({ token: '' }), '/');
  assert.equal(result.status, 503);
});

test('search authenticates upstream, maps posters, and caches results', async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async (input, options) => {
    calls += 1;
    const url = new URL(
      input instanceof Request ? input.url : input.toString()
    );
    assert.equal(url.searchParams.get('query'), 'Arrival');
    assert.equal(
      new Headers(options?.headers).get('Authorization'),
      'Bearer test-only'
    );
    return Response.json({
      page: 1,
      total_pages: 1,
      results: [
        {
          id: 329865,
          title: 'Arrival',
          poster_path: '/poster.jpg'
        }
      ]
    });
  };
  const router = createMovieRouter({ token: 'test-only', fetchImpl });

  const result = await call(router, '/?q=Arrival');
  const body = result.body as ListResponse;
  assert.equal(
    body.results[0].posterUrl,
    'https://image.tmdb.org/t/p/w500/poster.jpg'
  );
  await call(router, '/?q=Arrival');
  assert.equal(calls, 1);
});

test('concurrent cache misses share one provider request', async () => {
  let calls = 0;
  let releaseProvider!: () => void;
  const providerGate = new Promise<void>((resolve) => {
    releaseProvider = resolve;
  });
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    await providerGate;
    return Response.json({ id: 414906, title: 'The Batman' });
  };
  const router = createMovieRouter({ token: 'test-only', fetchImpl });

  const first = router.lookupMovie(414906);
  const second = router.lookupMovie(414906);
  await Promise.resolve();
  assert.equal(calls, 1);

  releaseProvider();
  const [firstMovie, secondMovie] = await Promise.all([first, second]);
  assert.equal(firstMovie.id, 414906);
  assert.equal(secondMovie.id, 414906);
});

test('invalid page and movie IDs never call the provider', async () => {
  const fetchImpl: typeof fetch = async () => {
    throw new Error('Should not call');
  };
  const router = createMovieRouter({ token: 'test-only', fetchImpl });

  assert.equal((await call(router, '/?page=0')).status, 400);
  assert.equal((await call(router, '/not-a-number')).status, 400);
});

test('upstream authentication errors do not leak provider content', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(null, { status: 401 });
  const result = await call(
    createMovieRouter({ token: 'test-only', fetchImpl }),
    '/'
  );
  assert.equal(result.status, 502);
  assert.match((result.body as { error: string }).error, /unavailable/);
});

test('movie lookup uses the canonical TMDB detail record', async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString()
    );
    assert.equal(url.pathname, '/3/movie/414906');
    return Response.json({
      id: 414906,
      title: 'The Batman',
      release_date: '2022-03-01',
      poster_path: '/poster.jpg'
    });
  };
  const router = createMovieRouter({ token: 'test-only', fetchImpl });
  const movie = await router.lookupMovie(414906);

  assert.equal(movie.title, 'The Batman');
  assert.equal(movie.id, 414906);
  assert.equal(movie.releaseDate, '2022-03-01');
});
