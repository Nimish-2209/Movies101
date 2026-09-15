const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Film = require('./src/models/film_model');
const User = require('./src/models/user_model');
const {hashPassword, verifyPassword} = require('./src/services/password_service');
const app = express();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required.');
}

app.use(express.json());
app.use(cors());
const movieCatalog = require('./src/services/movie_catalog').createMovieRouter();
app.use('/api/v1/movies', movieCatalog);

app.get('/', function(req, res) {
  res.json({ msg: 'films' });
});

function normalizeKey(value) {
  return value.trim().toLowerCase();
}

function verifyToken(req, res, next) {
  const bearerHeader = req.headers.authorization;

  if (!bearerHeader || !bearerHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'A valid login token is required.' });
  }

  const bearerToken = bearerHeader.slice(7).trim();

  jwt.verify(bearerToken, JWT_SECRET, (err, authData) => {
    if (
      err ||
      !authData ||
      !authData.user ||
      !authData.user.usernameKey
    ) {
      return res.status(401).json({
        error: 'The login token is invalid or expired.'
      });
    }

    req.authData = authData;
    next();
  });
}

async function loadOwnedFilm(req, res, next) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid film id.' });
  }

  try {
    const film = await Film.findById(req.params.id).select('+ownerKey');

    if (!film) {
      return res.status(404).json({ error: 'Film not found.' });
    }

    if (film.ownerKey !== req.authData.user.usernameKey) {
      return res.status(403).json({
        error: 'You can only change movies on your shelf.'
      });
    }

    req.film = film;
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to load the movie right now.' });
  }
}

function validateRating(value) {
  const rating = Number(value);

  if (value === undefined || value === '' || value === null) {
    return { error: 'Film rating is required.' };
  }

  if (typeof value === 'boolean' || (typeof value === 'string' && value.trim() === '') || !Number.isInteger(rating) || rating < 0 || rating > 10) {
    return { error: 'Film rating must be a whole number from 0 to 10.' };
  }

  return { rating };
}

function validateOptionalRating(value) {
  if (value === undefined || value === null || value === '') {
    return { rating: undefined };
  }
  return validateRating(value);
}

function validateCredentials(body) {
  const username = typeof body.username === 'string'
    ? body.username.trim()
    : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (username === '') {
    return { error: 'Username is required.' };
  }

  if (username.length > 40) {
    return { error: 'Username must be 40 characters or fewer.' };
  }

  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters.' };
  }

  if (password.length > 128) {
    return { error: 'Password must be 128 characters or fewer.' };
  }

  return {
    username: username,
    usernameKey: normalizeKey(username),
    password: password
  };
}

function createLoginResponse(user) {
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
    token: token,
    user: { username: user.username }
  };
}

app.get('/api/v1/films', async(req, res) => {
  try {
    const films = await Film.aggregate([
      { $match: { rating: { $type: 'number' } } },
      {
        $group: {
          _id: { $ifNull: ['$tmdbId', { $toLower: { $trim: { input: '$name' } } }] },
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
    res.json(films);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to retrieve films right now.' });
  }
});

app.get('/api/v1/films/mine', verifyToken, async(req, res) => {
  try {
    const ownerKey = req.authData.user.usernameKey;
    const films = await Film.find({ ownerKey: ownerKey }).sort({ name: 1 });
    res.json(films);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to retrieve your films right now.' });
  }
});

app.post('/api/v1/films', verifyToken, async(req, res) => {
  const tmdbId = req.body.tmdbId;
  const ratingResult = validateOptionalRating(req.body.rating);
  if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0) {
    return res.status(400).json({error: 'Select a movie from search results first.'});
  }
  if (ratingResult.error) return res.status(400).json({error: ratingResult.error});

  let movie;
  try {
    movie = await movieCatalog.lookupMovie(tmdbId);
  } catch (error) {
    return res.status(error.status || 502).json({error: error.status === 404 ? 'Movie not found in TMDB.' : 'Unable to verify the movie right now.'});
  }
  if (!movie || movie.id !== tmdbId || !movie.title) {
    return res.status(502).json({error: 'Unable to verify the movie right now.'});
  }

  const owner = req.authData.user.username;
  const ownerKey = req.authData.user.usernameKey;
  const nameKey = 'tmdb:' + tmdbId;
  try {
    const existingFilm = await Film.findOne({ownerKey, nameKey});
    if (existingFilm) {
      if (ratingResult.rating === undefined) {
        return res.status(409).json({error: 'That movie is already on your shelf.'});
      }
      existingFilm.rating = ratingResult.rating;
      existingFilm.watched = true;
      return res.json(await existingFilm.save());
    }
    const film = new Film({
      name: movie.title,
      nameKey,
      tmdbId,
      releaseDate: movie.releaseDate,
      posterUrl: movie.posterUrl,
      ...(ratingResult.rating === undefined ? {} : {rating: ratingResult.rating}),
      watched: ratingResult.rating !== undefined,
      favorite: false,
      owner,
      ownerKey
    });
    res.status(201).json(await film.save());
  } catch (error) {
    if (error && error.code === 11000) return res.status(409).json({error: 'That movie is already on your shelf.'});
    console.error(error);
    res.status(500).json({error: 'Unable to add the movie right now.'});
  }
});

app.put('/api/v1/films/ratings', verifyToken, async(req, res) => {
  const requestedUpdates = Array.isArray(req.body.updates)
    ? req.body.updates
    : [];

  if (requestedUpdates.length === 0) {
    return res.status(400).json({
      error: 'Enter at least one film rating to update.'
    });
  }

  if (requestedUpdates.length > 100) {
    return res.status(400).json({
      error: 'A maximum of 100 film ratings can be updated at once.'
    });
  }

  const updates = [];
  const filmIds = new Set();

  for (const requestedUpdate of requestedUpdates) {
    const filmId = requestedUpdate && typeof requestedUpdate.id === 'string'
      ? requestedUpdate.id.trim()
      : '';
    const ratingResult = validateRating(
      requestedUpdate ? requestedUpdate.rating : undefined
    );

    if (!mongoose.Types.ObjectId.isValid(filmId)) {
      return res.status(400).json({ error: 'Invalid film id.' });
    }

    if (ratingResult.error) {
      return res.status(400).json({ error: ratingResult.error });
    }

    if (filmIds.has(filmId)) {
      return res.status(400).json({
        error: 'Each film can only be updated once per request.'
      });
    }

    filmIds.add(filmId);
    updates.push({ id: filmId, rating: ratingResult.rating });
  }

  try {
    const films = await Film.find({
      _id: { $in: Array.from(filmIds) }
    }).select('+ownerKey');

    if (films.length !== updates.length) {
      return res.status(404).json({
        error: 'One or more films could not be found.'
      });
    }

    const ownsEveryFilm = films.every((film) => {
      return film.ownerKey === req.authData.user.usernameKey;
    });

    if (!ownsEveryFilm) {
      return res.status(403).json({
        error: 'You can only update films that you added.'
      });
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

    res.json({
      updatedCount: updates.length,
      films: updates.map((update) => updatedFilmsById.get(update.id))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Unable to update the film ratings right now.'
    });
  }
});

app.put('/api/v1/films/:id/rating', verifyToken, loadOwnedFilm, async(req, res) => {
  const ratingResult = validateRating(req.body.rating);

  if (ratingResult.error) {
    return res.status(400).json({ error: ratingResult.error });
  }

  try {
    const film = req.film;
    film.rating = ratingResult.rating;
    film.watched = true;
    const updatedFilm = await film.save();
    res.json(updatedFilm);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to update the film right now.' });
  }
});

app.patch('/api/v1/films/:id', verifyToken, loadOwnedFilm, async(req, res) => {
  const hasWatched = Object.prototype.hasOwnProperty.call(req.body, 'watched');
  const hasFavorite = Object.prototype.hasOwnProperty.call(req.body, 'favorite');
  const hasRating = Object.prototype.hasOwnProperty.call(req.body, 'rating');
  if (!hasWatched && !hasFavorite && !hasRating) {
    return res.status(400).json({error: 'Choose something to update.'});
  }
  if (hasWatched && typeof req.body.watched !== 'boolean') {
    return res.status(400).json({error: 'Watched must be true or false.'});
  }
  if (hasFavorite && typeof req.body.favorite !== 'boolean') {
    return res.status(400).json({error: 'Favorite must be true or false.'});
  }
  const ratingResult = hasRating ? validateRating(req.body.rating) : {};
  if (ratingResult.error) return res.status(400).json({error: ratingResult.error});

  try {
    const film = req.film;
    if (hasWatched) film.watched = req.body.watched;
    if (hasFavorite) film.favorite = req.body.favorite;
    if (hasRating) {
      film.rating = ratingResult.rating;
      film.watched = true;
    }
    res.json(await film.save());
  } catch (error) {
    console.error(error);
    res.status(500).json({error: 'Unable to update the movie right now.'});
  }
});

app.delete('/api/v1/films/:id', verifyToken, loadOwnedFilm, async(req, res) => {
  try {
    await req.film.deleteOne();
    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(500).json({error: 'Unable to remove the movie right now.'});
  }
});

app.post('/api/v1/register', async(req, res) => {
  const credentials = validateCredentials(req.body);

  if (credentials.error) {
    return res.status(400).json({ error: credentials.error });
  }

  try {
    const existingUser = await User.findOne({
      usernameKey: credentials.usernameKey
    });

    if (existingUser) {
      return res.status(409).json({
        error: 'That username is already registered.'
      });
    }

    const passwordHash = await hashPassword(credentials.password);
    const user = new User({
      username: credentials.username,
      usernameKey: credentials.usernameKey,
      passwordHash: passwordHash
    });
    const savedUser = await user.save();

    res.status(201).json(createLoginResponse(savedUser));
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({
        error: 'That username is already registered.'
      });
    }

    console.error(error);
    res.status(500).json({ error: 'Unable to create the account right now.' });
  }
});

app.post('/api/v1/login', async(req, res) => {
  const credentials = validateCredentials(req.body);

  if (credentials.error) {
    return res.status(400).json({ error: credentials.error });
  }

  try {
    const user = await User.findOne({
      usernameKey: credentials.usernameKey
    }).select('+usernameKey +passwordHash');

    if (!user) {
      await hashPassword(credentials.password);
      return res.status(401).json({
        error: 'Invalid username or password.'
      });
    }

    const passwordIsValid = await verifyPassword(
      credentials.password,
      user.passwordHash
    );

    if (!passwordIsValid) {
      return res.status(401).json({
        error: 'Invalid username or password.'
      });
    }

    res.json(createLoginResponse(user));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to log in right now.' });
  }
});

module.exports = app;
