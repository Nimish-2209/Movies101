# Movies101 Responsive Web Client

This directory contains the responsive browser client. It is intentionally a
desktop-first web experience, while the Flutter client uses a separate native
mobile design.

## Features

- Public community-film browsing without an account
- One row per title with the average rating and number of user ratings
- Username/password signup and login
- Session restoration after a page refresh in the same browser tab
- Verified movie search, posters, watchlists, and ratings for authenticated users
- A private shelf with watchlist, watched, favorite, and removal controls
- Bulk rating updates: enter values only for films that should change, then
  press **Save Update** once
- Add and update controls hidden until authentication succeeds
- Responsive desktop table and mobile card layouts

## Run

Use the complete Docker stack from the project root:

```bash
docker compose up --build -d
```

Open:

```text
http://localhost:8080
```

Nginx serves `public/` and forwards `/api/v1/*` requests to the Films API, so
the client uses relative API paths and does not need a separate browser API
configuration.

For phone-browser testing, connect the phone and computer to the same network
and open the same address in Safari or Chrome.

## Browser authentication state

The client keeps the JWT and username in `sessionStorage`. A normal refresh in
the same tab restores the session by validating the token through
`GET /api/v1/films/mine`. Closing the tab, signing out, or receiving an expired
token clears the saved session.

## Tests

```bash
npm ci
npm test
```

The browser tests cover session restoration, expired tokens, verified movie IDs, and watchlist payloads.

## Important files

| File | Purpose |
| --- | --- |
| `public/index.html` | Accessible page structure and controls |
| `public/stylesheets/style.css` | Shared layout and cinema theme |
| `public/stylesheets/catalog.css` | Discovery cards and movie dialog |
| `public/stylesheets/collection.css` | Autocomplete and personal shelf styles |
| `public/films.js` | API requests, authentication state, and table rendering |
| `test/films_session.test.js` | Browser-session behavior tests |
