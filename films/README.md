# Movies101 Films API

This directory contains the Express REST API used by both Movies101 clients.
It stores users and film ratings in MongoDB, hashes passwords with `scrypt`,
issues JSON Web Tokens, and enforces ownership on protected film operations.

## Recommended startup

Run the complete stack from the project root:

```bash
docker compose up --build -d
```

Nginx then exposes the API at:

```text
http://localhost:8080/api/v1
```

Docker Compose supplies the internal MongoDB address and reads `JWT_SECRET`
from the root `.env` file.

## Run the API directly

With MongoDB already available:

```bash
npm ci
JWT_SECRET=replace-with-a-private-random-value \
MONGO_DB_URI=mongodb://localhost:27017/mydb \
npm start
```

The direct API server listens on port `3000` unless `PORT` is provided.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `JWT_SECRET` | Yes | Private signing key for login tokens |
| `JWT_EXPIRES_IN` | No | Token lifetime; defaults to `2h` |
| `MONGO_DB_URI` | In Docker | MongoDB connection string |
| `PORT` | No | HTTP port; defaults to `3000` |

Do not store the real JWT secret in source control. Generate a development
value with `openssl rand -hex 64`.

## Endpoints

| Method | Path | Auth | Request body |
| --- | --- | --- | --- |
| `GET` | `/api/v1/films` | Public | None |
| `POST` | `/api/v1/register` | Public | `{"username":"Alice","password":"password123"}` |
| `POST` | `/api/v1/login` | Public | `{"username":"Alice","password":"password123"}` |
| `GET` | `/api/v1/films/mine` | JWT | None |
| `POST` | `/api/v1/films` | JWT | `{"tmdbId":329865}` or include `"rating":9` |
| `PATCH` | `/api/v1/films/:id` | JWT | Any of `{"watched":true,"favorite":true,"rating":9}` |
| `DELETE` | `/api/v1/films/:id` | JWT | None |
| `PUT` | `/api/v1/films/ratings` | JWT | `{"updates":[{"id":"FILM_ID","rating":8}]}` |
| `PUT` | `/api/v1/films/:id/rating` | JWT | `{"rating":8}` |

JWT endpoints require this header:

```text
Authorization: Bearer TOKEN
```

`GET /films` groups titles case-insensitively and returns one community record
per film with `rating` and `ratingCount` fields.

## Validation rules

- Usernames are required and limited to 40 characters.
- Passwords must contain 8–128 characters.
- Ratings must be whole numbers from 0 through 10.
- New ratings require a verified TMDB movie ID; each user can rate a movie once. Existing title-only entries remain readable.
- Only the owner recorded in the verified JWT can update a rating.

## Tests

```bash
npm test
npm run test:integration
```

The integration suite uses the local MongoDB container through
`127.0.0.1:27017` and deletes only the dedicated
`movies101_integration_test` database.

The current unit tests verify salted password hashing, successful password
verification, and rejection of incorrect or malformed hashes.

## TMDB movie catalog

Set `TMDB_READ_ACCESS_TOKEN` in the root `.env` using your TMDB API settings, then run `docker compose up -d --build films`. The token remains server-side.

- `GET /api/v1/movies?q=Arrival&page=1`: title search; omit `q` for popular movies.
- `GET /api/v1/movies/329865`: movie details.

Responses include TMDB IDs, poster URLs, release dates and descriptions. Requests time out after eight seconds; successful responses are cached for five minutes (up to 200 entries per process). Existing community ratings remain separate from the TMDB catalog. The browser supports search, posters, details and pagination. The browser and Flutter clients both use these endpoints.
