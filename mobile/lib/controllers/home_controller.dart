import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/film.dart';
import '../providers/film_api_provider.dart';
import '../services/film_api.dart';

final homeControllerProvider = NotifierProvider<HomeController, HomeState>(
  HomeController.new,
);

class HomeNotice {
  const HomeNotice(this.id, this.message, {this.isError = false});

  final int id;
  final String message;
  final bool isError;
}

class HomeState {
  const HomeState({
    this.token,
    this.username,
    this.isLoading = false,
    this.communityLoaded = false,
    this.myFilmsLoaded = false,
    this.selectedTab = 0,
    this.searchQuery = '',
    this.myFilmFilter = 'all',
    this.communityFilms = const [],
    this.myFilms = const [],
    this.notice,
  });

  final String? token;
  final String? username;
  final bool isLoading;
  final bool communityLoaded;
  final bool myFilmsLoaded;
  final int selectedTab;
  final String searchQuery;
  final String myFilmFilter;
  final List<Film> communityFilms;
  final List<Film> myFilms;
  final HomeNotice? notice;

  bool get isSignedIn => token != null;

  List<Film> get visibleCommunityFilms {
    final query = searchQuery.trim().toLowerCase();
    if (query.isEmpty) return communityFilms;
    return communityFilms
        .where((film) => film.name.toLowerCase().contains(query))
        .toList(growable: false);
  }

  List<Film> get visibleMyFilms {
    return switch (myFilmFilter) {
      'watchlist' =>
        myFilms.where((film) => !film.watched).toList(growable: false),
      'watched' =>
        myFilms.where((film) => film.watched).toList(growable: false),
      'favorites' =>
        myFilms.where((film) => film.favorite).toList(growable: false),
      _ => myFilms,
    };
  }

  HomeState copyWith({
    String? token,
    String? username,
    bool clearSession = false,
    bool? isLoading,
    bool? communityLoaded,
    bool? myFilmsLoaded,
    int? selectedTab,
    String? searchQuery,
    String? myFilmFilter,
    List<Film>? communityFilms,
    List<Film>? myFilms,
    HomeNotice? notice,
  }) {
    return HomeState(
      token: clearSession ? null : token ?? this.token,
      username: clearSession ? null : username ?? this.username,
      isLoading: isLoading ?? this.isLoading,
      communityLoaded: communityLoaded ?? this.communityLoaded,
      myFilmsLoaded: myFilmsLoaded ?? this.myFilmsLoaded,
      selectedTab: selectedTab ?? this.selectedTab,
      searchQuery: searchQuery ?? this.searchQuery,
      myFilmFilter: myFilmFilter ?? this.myFilmFilter,
      communityFilms: communityFilms ?? this.communityFilms,
      myFilms: myFilms ?? this.myFilms,
      notice: notice ?? this.notice,
    );
  }
}

class HomeController extends Notifier<HomeState> {
  int _activeRequests = 0;
  int _noticeId = 0;

  FilmApi get _api => ref.read(filmApiProvider);

  @override
  HomeState build() => const HomeState();

  Future<T?> _request<T>(Future<T> Function() action) async {
    _activeRequests++;
    state = state.copyWith(isLoading: true);

    try {
      return await action();
    } on ApiException catch (error) {
      final sessionExpired = error.statusCode == 401 && state.isSignedIn;
      if (sessionExpired) {
        state = state.copyWith(
          clearSession: true,
          myFilms: const [],
          myFilmsLoaded: false,
          selectedTab: 2,
        );
      }
      _showNotice(
        sessionExpired
            ? '${error.message} Please sign in again.'
            : error.message,
        isError: true,
      );
    } catch (_) {
      _showNotice('Unable to reach Movies101 right now.', isError: true);
    } finally {
      _activeRequests--;
      state = state.copyWith(isLoading: _activeRequests > 0);
    }
    return null;
  }

  void _showNotice(String message, {bool isError = false}) {
    state = state.copyWith(
      notice: HomeNotice(++_noticeId, message, isError: isError),
    );
  }

  Future<bool> authenticate({
    required String username,
    required String password,
    required bool createAccount,
  }) async {
    final session = await _request(() async {
      final token = createAccount
          ? await _api.register(username, password)
          : await _api.login(username, password);
      return (token: token, films: await _api.getMyFilms(token));
    });
    if (session == null) return false;

    state = state.copyWith(
      token: session.token,
      username: username,
      myFilms: session.films,
      myFilmsLoaded: true,
      selectedTab: 1,
    );
    _showNotice(
      createAccount
          ? 'Account created. Welcome, $username.'
          : 'Welcome back, $username.',
    );
    return true;
  }

  void logout() {
    state = state.copyWith(
      clearSession: true,
      myFilms: const [],
      myFilmsLoaded: false,
      selectedTab: 0,
    );
    _showNotice('You are signed out. Discovery stays open.');
  }

  Future<void> loadCommunity({bool announce = true}) async {
    final films = await _request(_api.getCommunityFilms);
    if (films == null) return;

    state = state.copyWith(communityFilms: films, communityLoaded: true);
    if (announce) {
      _showNotice(
        'Refreshed ${films.length} community '
        'film${films.length == 1 ? '' : 's'}.',
      );
    }
  }

  Future<void> loadMyFilms({bool announce = true}) async {
    final token = state.token;
    if (token == null) return;

    final films = await _request(() => _api.getMyFilms(token));
    if (films == null) return;

    state = state.copyWith(myFilms: films, myFilmsLoaded: true);
    if (announce) _showNotice('Your film shelf is up to date.');
  }

  void selectTab(int index) {
    state = state.copyWith(selectedTab: index);
    if (index == 1 && state.isSignedIn && !state.myFilmsLoaded) {
      unawaited(loadMyFilms(announce: false));
    }
  }

  void setSearchQuery(String query) {
    state = state.copyWith(searchQuery: query);
  }

  void setMyFilmFilter(String filter) {
    state = state.copyWith(myFilmFilter: filter);
  }

  Future<bool> addFilm({required int tmdbId, int? rating}) async {
    final token = state.token;
    if (token == null) return false;

    final result = await _request(() async {
      final added = await _api.addFilm(
        token: token,
        tmdbId: tmdbId,
        rating: rating,
      );
      return (added: added, films: await _api.getMyFilms(token));
    });
    if (result == null) return false;

    state = state.copyWith(
      myFilms: result.films,
      myFilmsLoaded: true,
      selectedTab: 1,
    );
    _showNotice(
      rating == null
          ? '“${result.added.name}” joined your watchlist. Future-you has plans.'
          : 'Rated “${result.added.name}” $rating/10. Bold take!',
    );
    return true;
  }

  Future<void> updateRating(Film film, int rating) async {
    final token = state.token;
    if (token == null) return;

    final updated = await _request(
      () => _api.updateRating(token: token, filmId: film.id, rating: rating),
    );
    if (updated == null) return;

    _replaceFilm(updated);
    _showNotice(
      'Updated “${updated.name}” to '
      '${updated.rating!.toStringAsFixed(0)}/10.',
    );
  }

  Future<void> patchFilm(Film film, {bool? watched, bool? favorite}) async {
    final token = state.token;
    if (token == null) return;

    final updated = await _request(
      () => _api.updateFilm(
        token: token,
        filmId: film.id,
        watched: watched,
        favorite: favorite,
      ),
    );
    if (updated == null) return;

    _replaceFilm(updated);
    _showNotice(
      favorite != null
          ? (favorite
                ? 'A star is born. Added to favorites!'
                : 'Removed from favorites.')
          : 'Marked watched. Popcorn evidence accepted.',
    );
  }

  Future<void> deleteFilm(Film film) async {
    final token = state.token;
    if (token == null) return;

    final removed = await _request(
      () => _api.deleteFilm(token: token, filmId: film.id),
    );
    if (removed != true) return;

    state = state.copyWith(
      myFilms: state.myFilms
          .where((item) => item.id != film.id)
          .toList(growable: false),
    );
    _showNotice('“${film.name}” left the building.');
  }

  void requireSignIn() {
    state = state.copyWith(selectedTab: 2);
    _showNotice('Sign in before adding a film.', isError: true);
  }

  void _replaceFilm(Film updated) {
    state = state.copyWith(
      myFilms: state.myFilms
          .map((film) => film.id == updated.id ? updated : film)
          .toList(growable: false),
    );
  }
}
