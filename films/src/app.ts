import cors from 'cors';
import express, {
  type NextFunction,
  type Request,
  type Response
} from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import mongoose from 'mongoose';
import { TRUST_PROXY_HOPS } from './config';
import { aiRateLimit } from './middleware/ai_rate_limit';
import { authRateLimit } from './middleware/auth_rate_limit';
import Film from './models/film_model';
import User, { type UserDocument } from './models/user_model';
import {
  AiRecommendationError,
  createOllamaRecommender,
  type AssistantMessage
} from './services/ai_recommender';
import { createMovieRouter } from './services/movie_catalog';
import { getMovieAssistantResponse } from './services/movie_recommendations';
import { hashPassword, verifyPassword } from './services/password_service';
import type { AuthTokenPayload } from './types/express';

const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required.');
  }
  return secret;
})();
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN ??
  '2h') as SignOptions['expiresIn'];

type ValidationResult<T> =
  { ok: true; value: T } | { ok: false; error: string };

interface Credentials {
  username: string;
  usernameKey: string;
  password: string;
}

interface CodedError {
  code?: number;
  status?: number;
}

function validateAssistantMessages(
  value: unknown
): ValidationResult<AssistantMessage[]> {
  if (!Array.isArray(value) || value.length === 0 || value.length > 12) {
    return { ok: false, error: 'Send between 1 and 12 chat messages.' };
  }

  let totalCharacters = 0;
  const messages: AssistantMessage[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) {
      return { ok: false, error: 'Each chat message must be valid.' };
    }
    const { role, content } = item as Record<string, unknown>;
    const trimmedContent = typeof content === 'string' ? content.trim() : '';
    if (
      (role !== 'user' && role !== 'assistant') ||
      trimmedContent.length === 0 ||
      trimmedContent.length > 500
    ) {
      return {
        ok: false,
        error: 'Chat messages must contain 1 to 500 characters.'
      };
    }
    totalCharacters += trimmedContent.length;
    messages.push({ role, content: trimmedContent });
  }

  if (totalCharacters > 4000) {
    return { ok: false, error: 'That conversation is too long.' };
  }
  if (messages.at(-1)?.role !== 'user') {
    return { ok: false, error: 'The last chat message must be yours.' };
  }
  return { ok: true, value: messages };
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function isAuthTokenPayload(value: unknown): value is AuthTokenPayload {
  if (typeof value !== 'object' || value === null || !('user' in value)) {
    return false;
  }

  const user = value.user;
  return (
    typeof user === 'object' &&
    user !== null &&
    'usernameKey' in user &&
    typeof user.usernameKey === 'string' &&
    'username' in user &&
    typeof user.username === 'string'
  );
}

function getErrorNumber(
  error: unknown,
  field: keyof CodedError
): number | undefined {
  if (typeof error !== 'object' || error === null || !(field in error)) {
    return undefined;
  }

  const value = (error as CodedError)[field];
  return typeof value === 'number' ? value : undefined;
}

function verifyToken(
  request: Request,
  response: Response,
  next: NextFunction
): void {
  const bearerHeader = request.headers.authorization;

  if (!bearerHeader?.startsWith('Bearer ')) {
    response.status(401).json({ error: 'A valid login token is required.' });
    return;
  }

  const bearerToken = bearerHeader.slice(7).trim();
  jwt.verify(bearerToken, JWT_SECRET, (error, authData) => {
    if (error || !isAuthTokenPayload(authData)) {
      response.status(401).json({
        error: 'The login token is invalid or expired.'
      });
      return;
    }

    request.authData = authData;
    next();
  });
}

async function loadOwnedFilm(
  request: Request,
  response: Response,
  next: NextFunction
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(request.params.id)) {
    response.status(400).json({ error: 'Invalid film id.' });
    return;
  }

  try {
    const film = await Film.findById(request.params.id).select('+ownerKey');

    if (!film) {
      response.status(404).json({ error: 'Film not found.' });
      return;
    }

    if (film.ownerKey !== request.authData.user.usernameKey) {
      response.status(403).json({
        error: 'You can only change movies on your shelf.'
      });
      return;
    }

    request.film = film;
    next();
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: 'Unable to load the movie right now.' });
  }
}

function validateRating(value: unknown): ValidationResult<number> {
  if (value === undefined || value === '' || value === null) {
    return { ok: false, error: 'Film rating is required.' };
  }

  const rating = Number(value);
  if (
    typeof value === 'boolean' ||
    (typeof value === 'string' && value.trim() === '') ||
    !Number.isInteger(rating) ||
    rating < 0 ||
    rating > 10
  ) {
    return {
      ok: false,
      error: 'Film rating must be a whole number from 0 to 10.'
    };
  }

  return { ok: true, value: rating };
}

function validateOptionalRating(
  value: unknown
): ValidationResult<number | undefined> {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: undefined };
  }
  return validateRating(value);
}

function validateCredentials(body: unknown): ValidationResult<Credentials> {
  const input =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const username =
    typeof input.username === 'string' ? input.username.trim() : '';
  const password = typeof input.password === 'string' ? input.password : '';

  if (username === '') {
    return { ok: false, error: 'Username is required.' };
  }
  if (username.length > 40) {
    return { ok: false, error: 'Username must be 40 characters or fewer.' };
  }
  if (password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }
  if (password.length > 128) {
    return { ok: false, error: 'Password must be 128 characters or fewer.' };
  }

  return {
    ok: true,
    value: {
      username,
      usernameKey: normalizeKey(username),
      password
    }
  };
}

function createLoginResponse(user: UserDocument) {
  const token = jwt.sign(
    {
      user: {
        id: user._id.toString(),
        username: user.username,
        usernameKey: user.usernameKey
      }
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  return {
    token,
    user: { username: user.username }
  };
}

const app = express();
app.set('trust proxy', TRUST_PROXY_HOPS);
app.use(express.json());
app.use(cors());

const movieCatalog = createMovieRouter();
const aiRecommender = createOllamaRecommender();
app.use('/api/v1/movies', movieCatalog);

app.get('/', (_request, response) => {
  response.json({ msg: 'films' });
});

app.get('/api/v1/films', async (_request, response) => {
  try {
    const films = await Film.aggregate([
      { $match: { rating: { $type: 'number' } } },
      {
        $group: {
          _id: {
            $ifNull: ['$tmdbId', { $toLower: { $trim: { input: '$name' } } }]
          },
          name: { $first: '$name' },
          tmdbId: { $first: '$tmdbId' },
          releaseDate: { $first: '$releaseDate' },
          posterUrl: { $first: '$posterUrl' },
          rating: { $avg: '$rating' },
          ratingCount: { $sum: 1 }
        }
      },
      {
        $project: {
          name: 1,
          tmdbId: 1,
          releaseDate: 1,
          posterUrl: 1,
          rating: { $round: ['$rating', 1] },
          ratingCount: 1
        }
      },
      { $sort: { name: 1 } }
    ]);
    response.json(films);
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: 'Unable to retrieve films right now.' });
  }
});

app.post(
  '/api/v1/assistant',
  verifyToken,
  aiRateLimit,
  async (request, response) => {
    const messagesResult = validateAssistantMessages(request.body?.messages);
    if (!messagesResult.ok) {
      response.status(400).json({ error: messagesResult.error });
      return;
    }

    try {
      const shelf = await Film.find({
        ownerKey: request.authData.user.usernameKey
      })
        .select('name tmdbId')
        .lean();
      const result = await getMovieAssistantResponse({
        messages: messagesResult.value,
        excludedMovies: shelf.map((movie) => ({
          name: movie.name,
          ...(movie.tmdbId === undefined ? {} : { tmdbId: movie.tmdbId })
        })),
        recommender: aiRecommender,
        movieCatalog
      });
      response.json(result);
    } catch (error) {
      if (error instanceof AiRecommendationError) {
        response.status(503).json({ error: error.message });
        return;
      }
      const status = getErrorNumber(error, 'status');
      if (status) {
        response.status(status).json({
          error: 'The movie catalog missed its cue. Try again.'
        });
        return;
      }
      console.error(error);
      response.status(500).json({
        error: 'Reel Talk lost the plot. Try again in a moment.'
      });
    }
  }
);

app.get('/api/v1/films/mine', verifyToken, async (request, response) => {
  try {
    const films = await Film.find({
      ownerKey: request.authData.user.usernameKey
    }).sort({ name: 1 });
    response.json(films);
  } catch (error) {
    console.error(error);
    response
      .status(500)
      .json({ error: 'Unable to retrieve your films right now.' });
  }
});

app.post('/api/v1/films', verifyToken, async (request, response) => {
  const tmdbId = request.body.tmdbId;
  const ratingResult = validateOptionalRating(request.body.rating);

  if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
    response
      .status(400)
      .json({ error: 'Select a movie from search results first.' });
    return;
  }
  if (!ratingResult.ok) {
    response.status(400).json({ error: ratingResult.error });
    return;
  }

  let movie;
  try {
    movie = await movieCatalog.lookupMovie(tmdbId);
  } catch (error) {
    const status = getErrorNumber(error, 'status') ?? 502;
    response.status(status).json({
      error:
        status === 404
          ? 'Movie not found in TMDB.'
          : 'Unable to verify the movie right now.'
    });
    return;
  }

  if (movie.id !== tmdbId || !movie.title) {
    response
      .status(502)
      .json({ error: 'Unable to verify the movie right now.' });
    return;
  }

  const owner = request.authData.user.username;
  const ownerKey = request.authData.user.usernameKey;
  const nameKey = `tmdb:${tmdbId}`;

  try {
    const rating = ratingResult.value;
    const result = await Film.findOneAndUpdate(
      { ownerKey, nameKey },
      {
        $setOnInsert: {
          name: movie.title,
          nameKey,
          tmdbId,
          releaseDate: movie.releaseDate,
          posterUrl: movie.posterUrl,
          favorite: false,
          owner,
          ownerKey,
          ...(rating === undefined ? { watched: false } : {})
        },
        ...(rating === undefined ? {} : { $set: { rating, watched: true } })
      },
      {
        upsert: true,
        returnDocument: 'after',
        includeResultMetadata: true,
        runValidators: true,
        setDefaultsOnInsert: false
      }
    );
    const inserted = result.lastErrorObject?.updatedExisting === false;

    if (!inserted && rating === undefined) {
      response
        .status(409)
        .json({ error: 'That movie is already on your shelf.' });
      return;
    }
    if (!result.value) {
      throw new Error('Movie upsert returned no document.');
    }

    response.status(inserted ? 201 : 200).json(result.value);
  } catch (error) {
    if (getErrorNumber(error, 'code') === 11000) {
      response
        .status(409)
        .json({ error: 'That movie is already on your shelf.' });
      return;
    }
    console.error(error);
    response.status(500).json({ error: 'Unable to add the movie right now.' });
  }
});

app.put('/api/v1/films/ratings', verifyToken, async (request, response) => {
  const requestedUpdates = Array.isArray(request.body.updates)
    ? request.body.updates
    : [];

  if (requestedUpdates.length === 0) {
    response.status(400).json({
      error: 'Enter at least one film rating to update.'
    });
    return;
  }
  if (requestedUpdates.length > 100) {
    response.status(400).json({
      error: 'A maximum of 100 film ratings can be updated at once.'
    });
    return;
  }

  const updates: Array<{ id: string; rating: number }> = [];
  const filmIds = new Set<string>();

  for (const requestedUpdate of requestedUpdates) {
    const filmId =
      requestedUpdate && typeof requestedUpdate.id === 'string'
        ? requestedUpdate.id.trim()
        : '';
    const ratingResult = validateRating(requestedUpdate?.rating);

    if (!mongoose.Types.ObjectId.isValid(filmId)) {
      response.status(400).json({ error: 'Invalid film id.' });
      return;
    }
    if (!ratingResult.ok) {
      response.status(400).json({ error: ratingResult.error });
      return;
    }
    if (filmIds.has(filmId)) {
      response.status(400).json({
        error: 'Each film can only be updated once per request.'
      });
      return;
    }

    filmIds.add(filmId);
    updates.push({ id: filmId, rating: ratingResult.value });
  }

  try {
    const films = await Film.find({
      _id: { $in: Array.from(filmIds) }
    }).select('+ownerKey');

    if (films.length !== updates.length) {
      response.status(404).json({
        error: 'One or more films could not be found.'
      });
      return;
    }

    if (
      !films.every(
        (film) => film.ownerKey === request.authData.user.usernameKey
      )
    ) {
      response.status(403).json({
        error: 'You can only update films that you added.'
      });
      return;
    }

    await Film.bulkWrite(
      updates.map((update) => ({
        updateOne: {
          filter: { _id: update.id },
          update: { $set: { rating: update.rating, watched: true } }
        }
      }))
    );

    const updatedFilms = await Film.find({
      _id: { $in: Array.from(filmIds) }
    });
    const updatedFilmsById = new Map(
      updatedFilms.map((film) => [film._id.toString(), film])
    );

    response.json({
      updatedCount: updates.length,
      films: updates.map((update) => updatedFilmsById.get(update.id))
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({
      error: 'Unable to update the film ratings right now.'
    });
  }
});

app.put(
  '/api/v1/films/:id/rating',
  verifyToken,
  loadOwnedFilm,
  async (request, response) => {
    const ratingResult = validateRating(request.body.rating);
    if (!ratingResult.ok) {
      response.status(400).json({ error: ratingResult.error });
      return;
    }

    try {
      request.film.rating = ratingResult.value;
      request.film.watched = true;
      response.json(await request.film.save());
    } catch (error) {
      console.error(error);
      response
        .status(500)
        .json({ error: 'Unable to update the film right now.' });
    }
  }
);

app.patch(
  '/api/v1/films/:id',
  verifyToken,
  loadOwnedFilm,
  async (request, response) => {
    const hasWatched = Object.hasOwn(request.body, 'watched');
    const hasFavorite = Object.hasOwn(request.body, 'favorite');
    const hasRating = Object.hasOwn(request.body, 'rating');

    if (!hasWatched && !hasFavorite && !hasRating) {
      response.status(400).json({ error: 'Choose something to update.' });
      return;
    }
    if (hasWatched && typeof request.body.watched !== 'boolean') {
      response.status(400).json({ error: 'Watched must be true or false.' });
      return;
    }
    if (hasFavorite && typeof request.body.favorite !== 'boolean') {
      response.status(400).json({ error: 'Favorite must be true or false.' });
      return;
    }

    const ratingResult = hasRating
      ? validateRating(request.body.rating)
      : ({ ok: true, value: undefined } as const);
    if (!ratingResult.ok) {
      response.status(400).json({ error: ratingResult.error });
      return;
    }

    try {
      if (hasWatched) request.film.watched = request.body.watched;
      if (hasFavorite) request.film.favorite = request.body.favorite;
      if (ratingResult.value !== undefined) {
        request.film.rating = ratingResult.value;
        request.film.watched = true;
      }
      response.json(await request.film.save());
    } catch (error) {
      console.error(error);
      response
        .status(500)
        .json({ error: 'Unable to update the movie right now.' });
    }
  }
);

app.delete(
  '/api/v1/films/:id',
  verifyToken,
  loadOwnedFilm,
  async (request, response) => {
    try {
      await request.film.deleteOne();
      response.status(204).end();
    } catch (error) {
      console.error(error);
      response
        .status(500)
        .json({ error: 'Unable to remove the movie right now.' });
    }
  }
);

app.post('/api/v1/register', authRateLimit, async (request, response) => {
  const credentialsResult = validateCredentials(request.body);
  if (!credentialsResult.ok) {
    response.status(400).json({ error: credentialsResult.error });
    return;
  }
  const credentials = credentialsResult.value;

  try {
    const passwordHash = await hashPassword(credentials.password);
    const result = await User.findOneAndUpdate(
      { usernameKey: credentials.usernameKey },
      {
        $setOnInsert: {
          username: credentials.username,
          usernameKey: credentials.usernameKey,
          passwordHash
        }
      },
      {
        upsert: true,
        returnDocument: 'after',
        includeResultMetadata: true,
        runValidators: true,
        setDefaultsOnInsert: true
      }
    ).select('+usernameKey');

    if (result.lastErrorObject?.updatedExisting !== false) {
      response.status(409).json({
        error: 'That username is already registered.'
      });
      return;
    }
    if (!result.value) {
      throw new Error('User upsert returned no document.');
    }

    response.status(201).json(createLoginResponse(result.value));
  } catch (error) {
    if (getErrorNumber(error, 'code') === 11000) {
      response.status(409).json({
        error: 'That username is already registered.'
      });
      return;
    }
    console.error(error);
    response
      .status(500)
      .json({ error: 'Unable to create the account right now.' });
  }
});

app.post('/api/v1/login', authRateLimit, async (request, response) => {
  const credentialsResult = validateCredentials(request.body);
  if (!credentialsResult.ok) {
    response.status(400).json({ error: credentialsResult.error });
    return;
  }
  const credentials = credentialsResult.value;

  try {
    const user = await User.findOne({
      usernameKey: credentials.usernameKey
    }).select('+usernameKey +passwordHash');

    if (!user) {
      await hashPassword(credentials.password);
      response.status(401).json({ error: 'Invalid username or password.' });
      return;
    }

    if (!(await verifyPassword(credentials.password, user.passwordHash))) {
      response.status(401).json({ error: 'Invalid username or password.' });
      return;
    }

    response.json(createLoginResponse(user));
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: 'Unable to log in right now.' });
  }
});

export { aiRecommender, movieCatalog };
export default app;
