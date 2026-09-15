# Movies101 Native App

This Flutter application is the native client for the Movies101 Films API. It
uses the same red-and-dark color family as the website but has a separate
mobile-first interface rather than reproducing the web page.

## Native experience

- **Discover:** browse, search, and pull to refresh community films
- **My Films:** view personal ratings and open focused add/edit sheets
- **Account:** sign up, log in, review access details, and sign out
- Bottom navigation, cards, sheets, a floating action button, and touch-sized
  controls designed specifically for phones
- Community browsing available without authentication
- Add and update actions available only after login

## Requirements

- Flutter SDK with Dart `3.13.2` or a compatible newer release
- Android Studio with an Android SDK and emulator, or a connected Android phone
- The Movies101 Docker services running on the development computer

## Start the backend

From the parent project directory:

```bash
docker compose up --build -d
curl http://localhost:8080/api/v1/films
```

## Run from the terminal

```bash
flutter pub get
flutter run
```

## Run from Android Studio

1. Open this `mobile` directory as the project.
2. Wait for Flutter packages and Gradle synchronization to finish.
3. Select an Android emulator or connected device.
4. Run `lib/main.dart`.

The Android manifest already includes internet permission and local HTTP access
for the development API.

## API configuration

The Android emulator default is:

```text
http://10.0.2.2:8080/api/v1
```

For iOS Simulator, use `http://localhost:8080/api/v1`. For a physical device,
use the computer's LAN address. Override the value without editing source:

```bash
flutter run --dart-define=API_BASE_URL=http://NEW_MAC_IP:8080/api/v1
```

The `API_BASE_URL` value must include `/api/v1` and must not end with an extra
slash.

## Refresh behavior

The app retrieves community films when it starts. To load rating changes made
by another client, open **Discover** and pull downward until the refresh
indicator appears. The My Films screen supports the same pull-to-refresh
gesture for signed-in data.

## Authentication behavior

Signup and login send both the username and password to the API. Protected
requests attach the returned JWT as a Bearer token. The app never submits an
owner name; the server determines ownership from the token.

## Validate

```bash
flutter analyze
flutter test
```

Build an Android APK with:

```bash
flutter build apk
```

The Android and iOS platform projects are present under `android/` and `ios/`.
Android is the primary tested submission target; iOS builds additionally depend
on a compatible local Xcode installation and signing configuration.

## Important files

| File | Purpose |
| --- | --- |
| `lib/main.dart` | Application theme and startup |
| `lib/screens/home_screen.dart` | Navigation state and workflow coordination |
| `lib/screens/home_views.dart` | Discover, shelf, and account screens |
| `lib/screens/home_widgets.dart` | Shared film cards and empty/loading states |
| `lib/screens/home_sheets.dart` | Add-film and rating sheets |
| `lib/services/film_api.dart` | REST requests and JWT headers |
| `lib/models/film.dart` | Typed film response model |
| `assets/movies101_clapperboard.png` | In-app brand asset |
| `test/` | API, model, authentication-visibility, and widget tests |
