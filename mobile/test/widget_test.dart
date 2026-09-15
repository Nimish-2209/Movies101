import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:movies101_mobile/main.dart';
import 'package:movies101_mobile/models/film.dart';
import 'package:movies101_mobile/services/film_api.dart';

class FakeFilmApi extends FilmApi {
  @override
  Future<String> login(String username, String password) async => 'test-token';

  @override
  Future<String> register(String username, String password) async =>
      'test-token';

  @override
  Future<List<Film>> getCommunityFilms() async => const [
    Film(id: 'inception', name: 'Inception', rating: 7.5, ratingCount: 2),
  ];

  @override
  Future<List<Film>> getMyFilms(String token) async => const [];
}

void main() {
  test('Film converts API JSON into typed values', () {
    final film = Film.fromJson({
      '_id': 'film-1',
      'name': 'Inception',
      'rating': 7.5,
      'ratingCount': 2,
    });

    expect(film.id, 'film-1');
    expect(film.rating, 7.5);
    expect(film.ratingCount, 2);
    expect(film.owner, 'Community');
  });

  testWidgets('member film controls remain hidden until login', (tester) async {
    await tester.pumpWidget(Movies101App(api: FakeFilmApi()));
    await tester.pumpAndSettle();

    expect(find.text('BROWSE COMMUNITY FILMS'), findsOneWidget);
    expect(find.text('Add a film'), findsNothing);
    expect(find.text('Add Film'), findsNothing);

    await tester.tap(find.byKey(const Key('accountTab')));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('usernameField')), 'Alice');
    await tester.enterText(
      find.byKey(const Key('passwordField')),
      'demo-password',
    );
    await tester.tap(find.byKey(const Key('loginButton')));
    await tester.pumpAndSettle();

    expect(find.text('Signed in as Alice'), findsOneWidget);
    expect(find.byKey(const Key('addFilmFab')), findsOneWidget);

    await tester.tap(find.byKey(const Key('addFilmFab')));
    await tester.pumpAndSettle();

    expect(find.text('Add to my shelf'), findsOneWidget);
    expect(find.byKey(const Key('addFilmButton')), findsOneWidget);
  });
}
