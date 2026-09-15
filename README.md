# Movies101

Movies101 is a movie discovery and personal shelf app with a responsive web client, a Flutter client, and an Express/MongoDB API. Movie selections are verified against the external catalog before they can be saved.

## Features

- Search-as-you-type discovery with posters and details
- Guest community ratings
- JWT signup, login, and session restoration
- Watchlist, watched status, ratings, favorites, filters, and removal
- Web and Flutter clients backed by the same API

## Run locally

Create `.env` from `.env.example`, add the movie catalog token, then run:

```bash
docker compose up -d --build
```

Open `http://localhost:8080`.

## Project structure

- `films/`: API, authentication, catalog verification, and MongoDB models
- `web/`: responsive browser client
- `mobile/`: native Flutter client
- `default.conf`: Nginx static hosting and API proxy

## Validate

```bash
cd films && npm test
cd ../web && npm test
cd ../mobile && flutter analyze --no-pub && flutter test --no-pub
```
