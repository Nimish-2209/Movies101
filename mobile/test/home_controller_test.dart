import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:movies101_mobile/controllers/home_controller.dart';
import 'package:movies101_mobile/models/film.dart';
import 'package:movies101_mobile/providers/film_api_provider.dart';
import 'package:movies101_mobile/services/film_api.dart';

class FakeHomeFilmApi extends FilmApi {
  bool rejectShelfRequest = false;

  @override
  Future<String> login(String username, String password) async => 'test-token';

  @override
  Future<List<Film>> getMyFilms(String token) async {
    if (rejectShelfRequest) {
      throw const ApiException('Session expired.', statusCode: 401);
    }
    return const [
      Film(id: 'watchlist', name: 'Arrival'),
      Film(id: 'watched', name: 'Inception', rating: 9, watched: true),
      Film(
        id: 'favorite',
        name: 'The Batman',
        rating: 8,
        watched: true,
        favorite: true,
      ),
    ];
  }
}

void main() {
  test('home controller owns authentication and shelf filtering', () async {
    final api = FakeHomeFilmApi();
    final container = ProviderContainer(
      overrides: [filmApiProvider.overrideWithValue(api)],
    );
    addTearDown(container.dispose);

    final authenticated = await container
        .read(homeControllerProvider.notifier)
        .authenticate(
          username: 'Alice',
          password: 'demo-password',
          createAccount: false,
        );

    expect(authenticated, isTrue);
    expect(container.read(homeControllerProvider).username, 'Alice');
    expect(container.read(homeControllerProvider).myFilms, hasLength(3));

    container
        .read(homeControllerProvider.notifier)
        .setMyFilmFilter('favorites');
    expect(
      container.read(homeControllerProvider).visibleMyFilms.single.name,
      'The Batman',
    );
  });

  test('a 401 clears the session and returns the user to Account', () async {
    final api = FakeHomeFilmApi();
    final container = ProviderContainer(
      overrides: [filmApiProvider.overrideWithValue(api)],
    );
    addTearDown(container.dispose);
    final controller = container.read(homeControllerProvider.notifier);

    await controller.authenticate(
      username: 'Alice',
      password: 'demo-password',
      createAccount: false,
    );
    api.rejectShelfRequest = true;
    await controller.loadMyFilms();

    final state = container.read(homeControllerProvider);
    expect(state.isSignedIn, isFalse);
    expect(state.myFilms, isEmpty);
    expect(state.selectedTab, 2);
    expect(state.notice?.isError, isTrue);
  });
}
