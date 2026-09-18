# Movies101

Movies101 is a movie discovery and personal shelf app with a responsive web client, a Flutter client, and an Express/MongoDB API. Movie selections are verified against the external catalog before they can be saved.

## Features

- Search-as-you-type discovery with posters and details
- Guest community ratings
- JWT signup, login, and session restoration
- Watchlist, watched status, ratings, favorites, filters, and removal
- Reel Talk movie chat with catalog-verified recommendations
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

## Cloud deployment

The production layout uses Firebase Hosting for the website, Cloud Run for the Docker API, MongoDB Atlas for persistent data, and Ollama Cloud for Reel Talk.

- [`firebase.json`](./firebase.json) serves `web/public` and forwards `/api/**` to the `movies101-api` Cloud Run service in `us-east1`.
- [`cloudbuild.yaml`](./cloudbuild.yaml) builds the API image, stores it in Artifact Registry, and deploys it to Cloud Run.
- Cloud Run stores `MONGO_DB_URI`, `JWT_SECRET`, `TMDB_READ_ACCESS_TOKEN`, and `OLLAMA_API_KEY` as secrets. Public configuration uses `OLLAMA_BASE_URL=https://ollama.com` and `OLLAMA_MODEL=gpt-oss:20b`.

Before the first deployment, create a MongoDB Atlas M0 cluster, an Ollama API key, a GCP project with billing enabled, and an Artifact Registry Docker repository named `movies101`. Connect the GitHub repository to Cloud Build for backend deployments and Firebase Hosting for frontend deployments.
