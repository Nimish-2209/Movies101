const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createMovieRouter} = require('../src/services/movie_catalog');
async function call(router, path, query = {}, params = {}) {
  let status = 200, body;
  const route = router.stack.find(layer => layer.route.path === path).route;
  await route.stack[0].handle({query, params}, {status(value) {status = value; return this;}, json(value) {body = value;}});
  return {status, body};
}
test('missing credentials return a helpful unavailable response', async () => {
  const result = await call(createMovieRouter({token: ''}), '/'); assert.equal(result.status, 503);
});
test('search authenticates upstream, maps posters, and caches repeated requests', async () => {
  let calls = 0;
  const router = createMovieRouter({token: 'test-only', fetchImpl: async (url, options) => {
    calls++; assert.equal(url.searchParams.get('query'), 'Arrival'); assert.equal(options.headers.Authorization, 'Bearer test-only');
    return {ok: true, json: async () => ({page: 1, total_pages: 1, results: [{id: 329865, title: 'Arrival', poster_path: '/poster.jpg'}]})};
  }});
  const result = await call(router, '/', {q: 'Arrival'});
  assert.equal(result.body.results[0].posterUrl, 'https://image.tmdb.org/t/p/w500/poster.jpg');
  await call(router, '/', {q: 'Arrival'}); assert.equal(calls, 1);
});
test('invalid page and movie IDs never call the provider', async () => {
  const router = createMovieRouter({token: 'test-only', fetchImpl: () => {throw Error('Should not call');}});
  assert.equal((await call(router, '/', {page: '0'})).status, 400);
  assert.equal((await call(router, '/:id', {}, {id: '../config'})).status, 400);
});
test('upstream authentication errors do not leak provider content', async () => {
  const router = createMovieRouter({token: 'test-only', fetchImpl: async () => ({ok: false, status: 401})});
  const result = await call(router, '/'); assert.equal(result.status, 502); assert.match(result.body.error, /unavailable/);
});

test('movie lookup uses the canonical TMDB detail record', async () => {
  const router = createMovieRouter({token: 'test-only', fetchImpl: async url => {
    assert.equal(url.pathname, '/3/movie/414906');
    return {ok: true, json: async () => ({id: 414906, title: 'The Batman', release_date: '2022-03-01', poster_path: '/poster.jpg'})};
  }});
  const movie = await router.lookupMovie(414906);
  assert.equal(movie.title, 'The Batman');
  assert.equal(movie.id, 414906);
  assert.equal(movie.releaseDate, '2022-03-01');
});
