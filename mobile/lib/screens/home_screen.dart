import 'dart:async';

import 'package:flutter/material.dart';

import '../models/film.dart';
import '../services/film_api.dart';

part 'home_views.dart';
part 'home_widgets.dart';
part 'home_sheets.dart';

class MoviesHomeScreen extends StatefulWidget {
  MoviesHomeScreen({super.key, FilmApi? api}) : api = api ?? FilmApi();

  final FilmApi api;

  @override
  State<MoviesHomeScreen> createState() => _MoviesHomeScreenState();
}

class _MoviesHomeScreenState extends State<MoviesHomeScreen> {
  final _loginFormKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();

  String? _token;
  String? _username;
  bool _isLoading = false;
  bool _obscurePassword = true;
  bool _communityLoaded = false;
  bool _myFilmsLoaded = false;
  int _selectedTab = 0;
  String _searchQuery = '';
  String _myFilmFilter = 'all';
  List<Film> _communityFilms = const [];
  List<Film> _myFilms = const [];

  bool get _isSignedIn => _token != null;

  List<Film> get _visibleMyFilms {
    if (_myFilmFilter == 'watchlist') {
      return _myFilms.where((film) => !film.watched).toList(growable: false);
    }
    if (_myFilmFilter == 'watched') {
      return _myFilms.where((film) => film.watched).toList(growable: false);
    }
    if (_myFilmFilter == 'favorites') {
      return _myFilms.where((film) => film.favorite).toList(growable: false);
    }
    return _myFilms;
  }

  List<Film> get _visibleCommunityFilms {
    final query = _searchQuery.trim().toLowerCase();
    if (query.isEmpty) {
      return _communityFilms;
    }
    return _communityFilms
        .where((film) => film.name.toLowerCase().contains(query))
        .toList(growable: false);
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadCommunity(announce: false);
    });
  }

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<T?> _request<T>(Future<T> Function() action) async {
    setState(() => _isLoading = true);

    try {
      return await action();
    } on ApiException catch (error) {
      if (mounted) {
        final sessionExpired = error.statusCode == 401 && _isSignedIn;
        if (sessionExpired) {
          setState(() {
            _token = null;
            _username = null;
            _myFilms = const [];
            _myFilmsLoaded = false;
            _selectedTab = 2;
            _passwordController.clear();
          });
        }
        _showNotice(
          sessionExpired
              ? '${error.message} Please sign in again.'
              : error.message,
          isError: true,
        );
      }
    } catch (_) {
      if (mounted) {
        _showNotice('Unable to reach Movies101 right now.', isError: true);
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }

    return null;
  }

  void _showNotice(String message, {bool isError = false}) {
    if (!mounted) {
      return;
    }

    final messenger = ScaffoldMessenger.of(context);
    messenger
      ..clearSnackBars()
      ..showSnackBar(
        SnackBar(
          content: Row(
            children: [
              Icon(
                isError
                    ? Icons.error_outline_rounded
                    : Icons.check_circle_outline_rounded,
                color: isError
                    ? const Color(0xFFFF8E9A)
                    : const Color(0xFF72E6B1),
              ),
              const SizedBox(width: 12),
              Expanded(child: Text(message)),
            ],
          ),
        ),
      );
  }

  Future<void> _authenticate({required bool createAccount}) async {
    if (!(_loginFormKey.currentState?.validate() ?? false)) {
      return;
    }

    final username = _usernameController.text.trim();
    final password = _passwordController.text;
    final session = await _request(() async {
      final token = createAccount
          ? await widget.api.register(username, password)
          : await widget.api.login(username, password);
      final films = await widget.api.getMyFilms(token);
      return (token: token, films: films);
    });

    if (session == null || !mounted) {
      return;
    }

    setState(() {
      _token = session.token;
      _username = username;
      _myFilms = session.films;
      _myFilmsLoaded = true;
      _selectedTab = 1;
      _usernameController.clear();
      _passwordController.clear();
    });
    _showNotice(
      createAccount
          ? 'Account created. Welcome, $username.'
          : 'Welcome back, $username.',
    );
  }

  Future<void> _logout() async {
    setState(() {
      _token = null;
      _username = null;
      _myFilms = const [];
      _myFilmsLoaded = false;
      _selectedTab = 0;
      _passwordController.clear();
    });
    _showNotice('You are signed out. Discovery stays open.');
  }

  Future<void> _loadCommunity({bool announce = true}) async {
    final films = await _request(widget.api.getCommunityFilms);
    if (films == null || !mounted) {
      return;
    }

    setState(() {
      _communityFilms = films;
      _communityLoaded = true;
    });
    if (announce) {
      _showNotice(
        'Refreshed ${films.length} community '
        'film${films.length == 1 ? '' : 's'}.',
      );
    }
  }

  Future<void> _loadMyFilms({bool announce = true}) async {
    final token = _token;
    if (token == null) {
      return;
    }

    final films = await _request(() => widget.api.getMyFilms(token));
    if (films == null || !mounted) {
      return;
    }

    setState(() {
      _myFilms = films;
      _myFilmsLoaded = true;
    });
    if (announce) {
      _showNotice('Your film shelf is up to date.');
    }
  }

  void _selectTab(int index) {
    setState(() => _selectedTab = index);
    if (index == 1 && _isSignedIn && !_myFilmsLoaded) {
      _loadMyFilms(announce: false);
    }
  }

  Future<void> _openAddFilmSheet() async {
    if (!_isSignedIn) {
      setState(() => _selectedTab = 2);
      _showNotice('Sign in before adding a film.', isError: true);
      return;
    }

    final draft = await showModalBottomSheet<_FilmDraft>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _AddFilmSheet(api: widget.api),
    );
    if (draft == null || !mounted) {
      return;
    }

    final token = _token;
    if (token == null) {
      return;
    }

    final result = await _request(() async {
      final added = await widget.api.addFilm(
        token: token,
        tmdbId: draft.tmdbId,
        rating: draft.rating,
      );
      final films = await widget.api.getMyFilms(token);
      return (added: added, films: films);
    });
    if (result == null || !mounted) {
      return;
    }

    setState(() {
      _myFilms = result.films;
      _myFilmsLoaded = true;
      _selectedTab = 1;
    });
    _showNotice(
      draft.rating == null
          ? '“${result.added.name}” joined your watchlist. Future-you has plans.'
          : 'Rated “${result.added.name}” ${draft.rating}/10. Bold take!',
    );
  }

  Future<void> _editRating(Film film) async {
    final token = _token;
    if (token == null) {
      return;
    }

    final rating = await showModalBottomSheet<int>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _RatingSheet(film: film),
    );
    if (rating == null || !mounted) {
      return;
    }

    final updatedFilm = await _request(
      () => widget.api.updateRating(
        token: token,
        filmId: film.id,
        rating: rating,
      ),
    );
    if (updatedFilm == null || !mounted) {
      return;
    }

    setState(() {
      _myFilms = _myFilms
          .map((item) => item.id == updatedFilm.id ? updatedFilm : item)
          .toList(growable: false);
    });
    _showNotice(
      'Updated “${updatedFilm.name}” to '
      '${updatedFilm.rating!.toStringAsFixed(0)}/10.',
    );
  }

  Future<void> _patchFilm(Film film, {bool? watched, bool? favorite}) async {
    final token = _token;
    if (token == null) return;
    final updated = await _request(
      () => widget.api.updateFilm(
        token: token,
        filmId: film.id,
        watched: watched,
        favorite: favorite,
      ),
    );
    if (updated == null || !mounted) return;
    setState(() {
      _myFilms = _myFilms
          .map((item) => item.id == updated.id ? updated : item)
          .toList(growable: false);
    });
    _showNotice(
      favorite != null
          ? (favorite
                ? 'A star is born. Added to favorites!'
                : 'Removed from favorites.')
          : 'Marked watched. Popcorn evidence accepted.',
    );
  }

  Future<void> _deleteFilm(Film film) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Cut from the shelf?'),
        content: Text('Remove “${film.name}”?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep it'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    final token = _token;
    if (confirmed != true || token == null) return;
    final removed = await _request(
      () => widget.api.deleteFilm(token: token, filmId: film.id),
    );
    if (!mounted || removed != true) return;
    setState(
      () => _myFilms = _myFilms
          .where((item) => item.id != film.id)
          .toList(growable: false),
    );
    _showNotice('“${film.name}” left the building.');
  }

  static String? _validateUsername(String? value) {
    final username = value?.trim() ?? '';
    if (username.isEmpty) {
      return 'Enter a username.';
    }
    if (username.length > 40) {
      return 'Use 40 characters or fewer.';
    }
    return null;
  }

  static String? _validatePassword(String? value) {
    final password = value ?? '';
    if (password.length < 8 || password.length > 128) {
      return 'Use 8 to 128 characters.';
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final titles = ['Discover', 'My films', 'Account'];

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 20,
        title: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.asset(
                'assets/movies101_clapperboard.png',
                width: 34,
                height: 34,
                fit: BoxFit.cover,
              ),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  titles[_selectedTab],
                  style: const TextStyle(fontWeight: FontWeight.w900),
                ),
                const Text(
                  'MOVIES101',
                  style: TextStyle(
                    color: Color(0xFFE50914),
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 2,
                  ),
                ),
              ],
            ),
          ],
        ),
        actions: [
          if (_isSignedIn && _selectedTab != 2)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: IconButton(
                tooltip: 'Open account',
                onPressed: () => _selectTab(2),
                icon: CircleAvatar(
                  radius: 16,
                  backgroundColor: const Color(0xFFE50914),
                  child: Text(
                    (_username?.isNotEmpty ?? false)
                        ? _username![0].toUpperCase()
                        : 'M',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
              ),
            ),
        ],
        bottom: _isLoading
            ? const PreferredSize(
                preferredSize: Size.fromHeight(3),
                child: LinearProgressIndicator(minHeight: 3),
              )
            : null,
      ),
      body: IndexedStack(
        index: _selectedTab,
        children: [
          _DiscoverView(
            films: _visibleCommunityFilms,
            totalFilmCount: _communityFilms.length,
            isLoaded: _communityLoaded,
            searchQuery: _searchQuery,
            onSearchChanged: (value) => setState(() => _searchQuery = value),
            onRefresh: () => _loadCommunity(announce: false),
          ),
          _MyFilmsView(
            username: _username,
            films: _visibleMyFilms,
            totalFilmCount: _myFilms.length,
            filter: _myFilmFilter,
            isSignedIn: _isSignedIn,
            isLoaded: _myFilmsLoaded,
            onRefresh: () => _loadMyFilms(announce: false),
            onOpenAccount: () => _selectTab(2),
            onAddFilm: _openAddFilmSheet,
            onEditFilm: _editRating,
            onFilterChanged: (filter) => setState(() => _myFilmFilter = filter),
            onFavorite: (film) => _patchFilm(film, favorite: !film.favorite),
            onWatched: (film) => _patchFilm(film, watched: true),
            onDelete: _deleteFilm,
          ),
          _AccountView(
            formKey: _loginFormKey,
            usernameController: _usernameController,
            passwordController: _passwordController,
            username: _username,
            isSignedIn: _isSignedIn,
            isLoading: _isLoading,
            obscurePassword: _obscurePassword,
            onTogglePassword: () {
              setState(() => _obscurePassword = !_obscurePassword);
            },
            onLogin: () => _authenticate(createAccount: false),
            onRegister: () => _authenticate(createAccount: true),
            onLogout: _logout,
            validateUsername: _validateUsername,
            validatePassword: _validatePassword,
          ),
        ],
      ),
      floatingActionButton: _selectedTab == 1 && _isSignedIn
          ? FloatingActionButton.extended(
              key: const Key('addFilmFab'),
              onPressed: _isLoading ? null : _openAddFilmSheet,
              icon: const Icon(Icons.add_rounded),
              label: const Text('Add a film'),
            )
          : null,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _selectedTab,
        onDestinationSelected: _selectTab,
        destinations: const [
          NavigationDestination(
            key: Key('discoverTab'),
            icon: Icon(Icons.explore_outlined),
            selectedIcon: Icon(Icons.explore_rounded),
            label: 'Discover',
          ),
          NavigationDestination(
            key: Key('myFilmsTab'),
            icon: Icon(Icons.bookmark_border_rounded),
            selectedIcon: Icon(Icons.bookmark_rounded),
            label: 'My films',
          ),
          NavigationDestination(
            key: Key('accountTab'),
            icon: Icon(Icons.person_outline_rounded),
            selectedIcon: Icon(Icons.person_rounded),
            label: 'Account',
          ),
        ],
      ),
    );
  }
}
