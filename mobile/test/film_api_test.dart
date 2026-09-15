import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:movies101_mobile/services/film_api.dart';

void main() {
  const baseUrl = 'https://api.movies101.test/api/v1';

  test('login sends both username and password', () async {
    final client = MockClient((request) async {
      expect(request.method, 'POST');
      expect(request.url.toString(), '$baseUrl/login');
      expect(jsonDecode(request.body), {
        'username': 'Alice',
        'password': 'demo-password',
      });

      return http.Response(
        jsonEncode({'token': 'jwt-token'}),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    final api = FilmApi(client: client, baseUrl: baseUrl);

    expect(await api.login('Alice', 'demo-password'), 'jwt-token');
  });

  test('community films are decoded from the public endpoint', () async {
    final client = MockClient((request) async {
      expect(request.method, 'GET');
      expect(request.url.toString(), '$baseUrl/films');
      expect(request.headers.containsKey('Authorization'), isFalse);

      return http.Response(
        jsonEncode([
          {
            '_id': 'arrival',
            'name': 'Arrival',
            'rating': 8.5,
            'ratingCount': 2,
          },
        ]),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    final api = FilmApi(client: client, baseUrl: baseUrl);

    final films = await api.getCommunityFilms();

    expect(films.single.name, 'Arrival');
    expect(films.single.rating, 8.5);
    expect(films.single.ratingCount, 2);
    expect(films.single.owner, 'Community');
  });

  test('movie search returns catalog IDs and release dates', () async {
    final client = MockClient((request) async {
      expect(request.method, 'GET');
      expect(request.url.path, '/api/v1/movies');
      expect(request.url.queryParameters['q'], 'Batman');
      return http.Response(
        jsonEncode({
          'results': [
            {
              'id': 414906,
              'title': 'The Batman',
              'releaseDate': '2022-03-01',
              'posterUrl': null,
            },
          ],
        }),
        200,
      );
    });
    final api = FilmApi(client: client, baseUrl: baseUrl);
    final movies = await api.searchMovies('Batman');
    expect(movies.single.id, 414906);
    expect(movies.single.releaseDate, '2022-03-01');
  });

  test('adding a film sends the JWT and owner-free payload', () async {
    final client = MockClient((request) async {
      expect(request.method, 'POST');
      expect(request.url.toString(), '$baseUrl/films');
      expect(request.headers['authorization'], 'Bearer jwt-token');
      expect(jsonDecode(request.body), {'tmdbId': 329865, 'rating': 8});

      return http.Response(
        jsonEncode({
          '_id': 'film-1',
          'name': 'Arrival',
          'rating': 8,
          'owner': 'Alice',
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    final api = FilmApi(client: client, baseUrl: baseUrl);

    final film = await api.addFilm(
      token: 'jwt-token',
      tmdbId: 329865,
      rating: 8,
    );

    expect(film.owner, 'Alice');
  });

  test('watchlist add omits rating and decodes shelf state', () async {
    final client = MockClient((request) async {
      expect(request.method, 'POST');
      expect(request.headers['authorization'], 'Bearer jwt-token');
      expect(jsonDecode(request.body), {'tmdbId': 329865});
      return http.Response(
        jsonEncode({
          '_id': 'film-1',
          'name': 'Arrival',
          'watched': false,
          'favorite': false,
        }),
        201,
      );
    });
    final api = FilmApi(client: client, baseUrl: baseUrl);

    final film = await api.addFilm(token: 'jwt-token', tmdbId: 329865);

    expect(film.rating, isNull);
    expect(film.watched, isFalse);
    expect(film.favorite, isFalse);
  });

  test('shelf state can be patched and a movie can be removed', () async {
    var requestNumber = 0;
    final client = MockClient((request) async {
      requestNumber++;
      expect(request.headers['authorization'], 'Bearer jwt-token');
      if (requestNumber == 1) {
        expect(request.method, 'PATCH');
        expect(request.url.toString(), '$baseUrl/films/film-1');
        expect(jsonDecode(request.body), {'favorite': true});
        return http.Response(
          jsonEncode({
            '_id': 'film-1',
            'name': 'Arrival',
            'favorite': true,
            'watched': false,
          }),
          200,
        );
      }
      expect(request.method, 'DELETE');
      expect(request.url.toString(), '$baseUrl/films/film-1');
      return http.Response('', 204);
    });
    final api = FilmApi(client: client, baseUrl: baseUrl);

    final updated = await api.updateFilm(
      token: 'jwt-token',
      filmId: 'film-1',
      favorite: true,
    );
    expect(updated.favorite, isTrue);
    expect(await api.deleteFilm(token: 'jwt-token', filmId: 'film-1'), isTrue);
  });

  test('updating a rating sends PUT with the JWT', () async {
    final client = MockClient((request) async {
      expect(request.method, 'PUT');
      expect(request.url.toString(), '$baseUrl/films/film-1/rating');
      expect(request.headers['authorization'], 'Bearer jwt-token');
      expect(jsonDecode(request.body), {'rating': 9});

      return http.Response(
        jsonEncode({
          '_id': 'film-1',
          'name': 'Arrival',
          'rating': 9,
          'owner': 'Alice',
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    final api = FilmApi(client: client, baseUrl: baseUrl);

    final film = await api.updateRating(
      token: 'jwt-token',
      filmId: 'film-1',
      rating: 9,
    );

    expect(film.rating, 9);
    expect(film.owner, 'Alice');
  });

  test('API error messages remain visible to the UI', () async {
    final client = MockClient((_) async {
      return http.Response(
        jsonEncode({'error': 'You have already added this film.'}),
        409,
        headers: {'content-type': 'application/json'},
      );
    });
    final api = FilmApi(client: client, baseUrl: baseUrl);

    expect(
      () => api.addFilm(token: 'token', tmdbId: 329865, rating: 8),
      throwsA(
        isA<ApiException>()
            .having((error) => error.statusCode, 'statusCode', 409)
            .having(
              (error) => error.message,
              'message',
              'You have already added this film.',
            ),
      ),
    );
  });
}
