const {test} = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = 'test-only-secret';
const app = require('../app');
const Film = require('../src/models/film_model');

const catalog = app._router.stack.find(layer => layer.handle && layer.handle.lookupMovie).handle;
const route = app._router.stack.find(layer => layer.route && layer.route.path === '/api/v1/films' && layer.route.methods.post).route;
const saveFilm = route.stack.at(-1).handle;

async function invoke(body) {
  let status = 200, data;
  await saveFilm({body, authData: {user: {username: 'Alice', usernameKey: 'alice'}}}, {
    status(value) {status = value; return this;},
    json(value) {data = value; return this;}
  });
  return {status, data};
}

test('rating saves verified TMDB identity and ignores client-supplied title', async () => {
  const oldLookup = catalog.lookupMovie, oldFind = Film.findOne, oldSave = Film.prototype.save;
  let saved;
  try {
    catalog.lookupMovie = async id => ({id, title: 'The Batman', releaseDate: '2022-03-01', posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg'});
    Film.findOne = async () => null;
    Film.prototype.save = async function () {saved = this; return this;};
    const response = await invoke({tmdbId: 414906, name: 'Fake Title', rating: 8});
    assert.equal(response.status, 201);
    assert.equal(saved.name, 'The Batman');
    assert.equal(saved.nameKey, 'tmdb:414906');
    assert.equal(saved.tmdbId, 414906);
    assert.equal(saved.rating, 8);
    assert.equal(saved.releaseDate, '2022-03-01');
  } finally {catalog.lookupMovie = oldLookup; Film.findOne = oldFind; Film.prototype.save = oldSave;}
});

test('watchlist saves a verified movie without inventing a rating', async () => {
  const oldLookup = catalog.lookupMovie, oldFind = Film.findOne, oldSave = Film.prototype.save;
  let saved;
  try {
    catalog.lookupMovie = async id => ({id, title: 'Arrival', releaseDate: '2016-11-11', posterUrl: 'https://image.tmdb.org/t/p/w500/arrival.jpg'});
    Film.findOne = async () => null;
    Film.prototype.save = async function () {saved = this; return this;};
    const response = await invoke({tmdbId: 329865});
    assert.equal(response.status, 201);
    assert.equal(saved.name, 'Arrival');
    assert.equal(saved.rating, undefined);
    assert.equal(saved.watched, false);
    assert.equal(saved.favorite, false);
  } finally {catalog.lookupMovie = oldLookup; Film.findOne = oldFind; Film.prototype.save = oldSave;}
});

test('rating a movie already on the watchlist promotes it to watched', async () => {
  const oldLookup = catalog.lookupMovie, oldFind = Film.findOne;
  const existing = {rating: undefined, watched: false, async save() { return this; }};
  try {
    catalog.lookupMovie = async id => ({id, title: 'Arrival'});
    Film.findOne = async () => existing;
    const response = await invoke({tmdbId: 329865, rating: 9});
    assert.equal(response.status, 200);
    assert.equal(response.data.rating, 9);
    assert.equal(response.data.watched, true);
  } finally {catalog.lookupMovie = oldLookup; Film.findOne = oldFind;}
});

test('rating requires a valid TMDB ID', async () => {
  assert.equal((await invoke({name: 'Anything', rating: 8})).status, 400);
  assert.equal((await invoke({tmdbId: 0, rating: 8})).status, 400);
  assert.equal((await invoke({tmdbId: 414906, rating: false})).status, 400);
});

test('unverified movie cannot be saved', async () => {
  const oldLookup = catalog.lookupMovie;
  try {
    catalog.lookupMovie = async () => {throw Object.assign(new Error('Not found'), {status: 404});};
    const response = await invoke({tmdbId: 999999999, rating: 8});
    assert.equal(response.status, 404);
    assert.match(response.data.error, /not found/i);
  } finally {catalog.lookupMovie = oldLookup;}
});
