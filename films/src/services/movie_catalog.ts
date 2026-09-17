import express, {
  type Request,
  type RequestHandler,
  type Response as ExpressResponse,
  type Router
} from 'express';

const CACHE_DURATION_MS = 5 * 60 * 1000;
const CACHE_LIMIT = 200;
const REQUEST_TIMEOUT_MS = 8000;

interface ProviderMovie {
  id: number;
  title: string;
  release_date?: string;
  overview?: string;
  poster_path?: string | null;
  vote_average?: number;
  runtime?: number;
  genres?: Array<{ name: string }>;
}

interface ProviderMovieList {
  page: number;
  total_pages: number;
  results: ProviderMovie[];
}

export interface Movie {
  id: number;
  title: string;
  releaseDate: string;
  overview: string;
  posterUrl: string | null;
  tmdbRating?: number;
  runtime?: number;
  genres?: string[];
}

export interface MovieRouter extends Router {
  lookupMovie(id: number): Promise<Movie>;
  searchMovies(query: string): Promise<Movie[]>;
}

interface MovieRouterOptions {
  token?: string;
  fetchImpl?: typeof fetch;
}

interface CachedResponse {
  data: unknown;
  expires: number;
}

interface HttpError extends Error {
  status?: number;
}

type AsyncRoute = (
  request: Request,
  response: ExpressResponse
) => Promise<void>;

function httpError(message: string, status: number): HttpError {
  return Object.assign(new Error(message), { status });
}

function getErrorStatus(error: unknown): number | undefined {
  return error instanceof Error && 'status' in error
    ? Number((error as HttpError).status)
    : undefined;
}

function mapMovie(item: ProviderMovie): Movie {
  return {
    id: item.id,
    title: item.title,
    releaseDate: item.release_date ?? '',
    overview: item.overview ?? '',
    posterUrl: item.poster_path
      ? `https://image.tmdb.org/t/p/w500${item.poster_path}`
      : null,
    tmdbRating: item.vote_average,
    runtime: item.runtime,
    genres: item.genres?.map((genre) => genre.name)
  };
}

export function createMovieRouter({
  token = process.env.TMDB_READ_ACCESS_TOKEN,
  fetchImpl = globalThis.fetch
}: MovieRouterOptions = {}): MovieRouter {
  const router = express.Router() as MovieRouter;
  const cache = new Map<string, CachedResponse>();
  const inFlight = new Map<string, Promise<unknown>>();

  async function fetchProvider<T>(
    path: string,
    parameters: Record<string, string | number> = {}
  ): Promise<T> {
    if (!token) {
      throw httpError('Movie discovery is not configured yet.', 503);
    }

    const url = new URL(`https://api.themoviedb.org/3/${path}`);
    Object.entries(parameters).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });

    const cacheKey = url.toString();
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.data as T;
    if (cached) cache.delete(cacheKey);

    const existingRequest = inFlight.get(cacheKey);
    if (existingRequest) return existingRequest as Promise<T>;

    const providerRequest = (async (): Promise<T> => {
      let response: globalThis.Response;
      try {
        response = await fetchImpl(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json'
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
      } catch {
        throw httpError(
          'Movie provider is unavailable. Please try again.',
          502
        );
      }

      if (!response.ok) {
        const notFound = response.status === 404;
        throw httpError(
          notFound
            ? 'Movie not found.'
            : 'Movie provider is unavailable. Please try again.',
          notFound ? 404 : 502
        );
      }

      const data = (await response.json()) as T;
      if (cache.size >= CACHE_LIMIT) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey) cache.delete(oldestKey);
      }
      cache.set(cacheKey, {
        data,
        expires: Date.now() + CACHE_DURATION_MS
      });
      return data;
    })();

    inFlight.set(cacheKey, providerRequest);
    try {
      return await providerRequest;
    } finally {
      inFlight.delete(cacheKey);
    }
  }

  const handle = (handler: AsyncRoute): RequestHandler => {
    return async (request, response) => {
      try {
        await handler(request, response);
      } catch (error) {
        const status = getErrorStatus(error);
        response.status(status ?? 502).json({
          error:
            status && error instanceof Error
              ? error.message
              : 'Unable to load movies right now.'
        });
      }
    };
  };

  async function loadMovies(
    query: string,
    page = 1
  ): Promise<{
    page: number;
    totalPages: number;
    results: Movie[];
  }> {
    const data = await fetchProvider<ProviderMovieList>(
      query ? 'search/movie' : 'movie/popular',
      {
        page,
        language: 'en-US',
        include_adult: 'false',
        ...(query ? { query } : {})
      }
    );
    return {
      page: data.page,
      totalPages: Math.min(data.total_pages, 500),
      results: data.results.map(mapMovie)
    };
  }

  router.get(
    '/',
    handle(async (request, response) => {
      const query =
        typeof request.query.q === 'string' ? request.query.q.trim() : '';
      const page =
        request.query.page === undefined ? 1 : Number(request.query.page);
      const invalidRequest =
        !Number.isInteger(page) || page < 1 || page > 500 || query.length > 200;

      if (invalidRequest) {
        response.status(400).json({
          error: 'Use a search up to 200 characters and a page from 1 to 500.'
        });
        return;
      }

      const data = await loadMovies(query, page);
      response.json({
        page: data.page,
        totalPages: data.totalPages,
        results: data.results
      });
    })
  );

  router.get(
    '/:id',
    handle(async (request, response) => {
      if (!/^[1-9]\d{0,9}$/.test(request.params.id)) {
        response.status(400).json({ error: 'Invalid movie id.' });
        return;
      }

      const data = await fetchProvider<ProviderMovie>(
        `movie/${request.params.id}`,
        {
          language: 'en-US'
        }
      );
      response.json(mapMovie(data));
    })
  );

  router.lookupMovie = async (id: number) => {
    const data = await fetchProvider<ProviderMovie>(`movie/${id}`, {
      language: 'en-US'
    });
    return mapMovie(data);
  };

  router.searchMovies = async (query: string) => {
    return (await loadMovies(query.trim())).results;
  };

  return router;
}
