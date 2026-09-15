const express = require('express');

const CACHE_DURATION_MS = 5 * 60 * 1000;
const CACHE_LIMIT = 200;
const REQUEST_TIMEOUT_MS = 8000;

function createMovieRouter({
  token = process.env.TMDB_READ_ACCESS_TOKEN,
  fetchImpl = globalThis.fetch
} = {}) {
  const router = express.Router();
  const cache = new Map();

  async function request(path, parameters = {}) {
    if (!token) {
      throw Object.assign(
        new Error('Movie discovery is not configured yet.'),
        { status: 503 }
      );
    }

    const url = new URL('https://api.themoviedb.org/3/' + path);
    Object.entries(parameters).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    const cacheKey = url.toString();
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.data;

    let response;
    try {
      response = await fetchImpl(url, {
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/json'
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch (_) {
      throw Object.assign(
        new Error('Movie provider is unavailable. Please try again.'),
        { status: 502 }
      );
    }

    if (!response.ok) {
      const notFound = response.status === 404;
      throw Object.assign(
        new Error(
          notFound
            ? 'Movie not found.'
            : 'Movie provider is unavailable. Please try again.'
        ),
        { status: notFound ? 404 : 502 }
      );
    }

    const data = await response.json();
    if (cache.size >= CACHE_LIMIT) {
      cache.delete(cache.keys().next().value);
    }
    cache.set(cacheKey, {
      data,
      expires: Date.now() + CACHE_DURATION_MS
    });
    return data;
  }

  const mapMovie = (item) => ({
    id: item.id,
    title: item.title,
    releaseDate: item.release_date || '',
    overview: item.overview || '',
    posterUrl: item.poster_path
      ? 'https://image.tmdb.org/t/p/w500' + item.poster_path
      : null,
    tmdbRating: item.vote_average,
    runtime: item.runtime,
    genres: item.genres?.map((genre) => genre.name)
  });

  const handle = (handler) => async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      res.status(error.status || 502).json({
        error: error.status
          ? error.message
          : 'Unable to load movies right now.'
      });
    }
  };

  router.get('/', handle(async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const invalidRequest = !Number.isInteger(page) ||
      page < 1 ||
      page > 500 ||
      query.length > 200;

    if (invalidRequest) {
      return res.status(400).json({
        error: 'Use a search up to 200 characters and a page from 1 to 500.'
      });
    }

    const data = await request(
      query ? 'search/movie' : 'movie/popular',
      {
        page,
        language: 'en-US',
        include_adult: 'false',
        ...(query ? { query } : {})
      }
    );
    res.json({
      page: data.page,
      totalPages: Math.min(data.total_pages, 500),
      results: data.results.map(mapMovie)
    });
  }));

  router.get('/:id', handle(async (req, res) => {
    if (!/^[1-9]\d{0,9}$/.test(req.params.id)) {
      return res.status(400).json({ error: 'Invalid movie id.' });
    }

    const data = await request('movie/' + req.params.id, {
      language: 'en-US'
    });
    res.json(mapMovie(data));
  }));

  router.lookupMovie = async (id) => {
    const data = await request('movie/' + id, { language: 'en-US' });
    return mapMovie(data);
  };

  return router;
}

module.exports = { createMovieRouter };
