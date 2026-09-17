import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../controllers/catalog_search_controller.dart';
import '../controllers/home_controller.dart';
import '../models/catalog_movie.dart';
import '../models/film.dart';

part 'home_views.dart';
part 'home_widgets.dart';
part 'home_sheets.dart';

class MoviesHomeScreen extends ConsumerStatefulWidget {
  const MoviesHomeScreen({super.key});

  @override
  ConsumerState<MoviesHomeScreen> createState() => _MoviesHomeScreenState();
}

class _MoviesHomeScreenState extends ConsumerState<MoviesHomeScreen> {
  final _loginFormKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(homeControllerProvider.notifier).loadCommunity(announce: false);
    });
  }

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _showNotice(HomeNotice notice) {
    if (!mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    messenger
      ..clearSnackBars()
      ..showSnackBar(
        SnackBar(
          content: Row(
            children: [
              Icon(
                notice.isError
                    ? Icons.error_outline_rounded
                    : Icons.check_circle_outline_rounded,
                color: notice.isError
                    ? const Color(0xFFFF8E9A)
                    : const Color(0xFF72E6B1),
              ),
              const SizedBox(width: 12),
              Expanded(child: Text(notice.message)),
            ],
          ),
        ),
      );
  }

  Future<void> _authenticate({required bool createAccount}) async {
    if (!(_loginFormKey.currentState?.validate() ?? false)) return;

    final authenticated = await ref
        .read(homeControllerProvider.notifier)
        .authenticate(
          username: _usernameController.text.trim(),
          password: _passwordController.text,
          createAccount: createAccount,
        );
    if (authenticated && mounted) {
      _usernameController.clear();
      _passwordController.clear();
    }
  }

  void _logout() {
    _passwordController.clear();
    ref.read(homeControllerProvider.notifier).logout();
  }

  Future<void> _openAddFilmSheet() async {
    final controller = ref.read(homeControllerProvider.notifier);
    if (!ref.read(homeControllerProvider).isSignedIn) {
      controller.requireSignIn();
      return;
    }

    final draft = await showModalBottomSheet<_FilmDraft>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => const _AddFilmSheet(),
    );
    if (draft == null || !mounted) return;

    await controller.addFilm(tmdbId: draft.tmdbId, rating: draft.rating);
  }

  Future<void> _editRating(Film film) async {
    final rating = await showModalBottomSheet<int>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => _RatingSheet(film: film),
    );
    if (rating == null || !mounted) return;

    await ref.read(homeControllerProvider.notifier).updateRating(film, rating);
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
    if (confirmed != true || !mounted) return;
    await ref.read(homeControllerProvider.notifier).deleteFilm(film);
  }

  static String? _validateUsername(String? value) {
    final username = value?.trim() ?? '';
    if (username.isEmpty) return 'Enter a username.';
    if (username.length > 40) return 'Use 40 characters or fewer.';
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
    final state = ref.watch(homeControllerProvider);
    final controller = ref.read(homeControllerProvider.notifier);
    final titles = ['Discover', 'My films', 'Account'];

    ref.listen(homeControllerProvider.select((value) => value.notice), (
      previous,
      next,
    ) {
      if (next != null && next.id != previous?.id) _showNotice(next);
    });

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
                  titles[state.selectedTab],
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
          if (state.isSignedIn && state.selectedTab != 2)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: IconButton(
                tooltip: 'Open account',
                onPressed: () => controller.selectTab(2),
                icon: CircleAvatar(
                  radius: 16,
                  backgroundColor: const Color(0xFFE50914),
                  child: Text(
                    (state.username?.isNotEmpty ?? false)
                        ? state.username![0].toUpperCase()
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
        bottom: state.isLoading
            ? const PreferredSize(
                preferredSize: Size.fromHeight(3),
                child: LinearProgressIndicator(minHeight: 3),
              )
            : null,
      ),
      body: IndexedStack(
        index: state.selectedTab,
        children: [
          _DiscoverView(
            films: state.visibleCommunityFilms,
            totalFilmCount: state.communityFilms.length,
            isLoaded: state.communityLoaded,
            searchQuery: state.searchQuery,
            onSearchChanged: controller.setSearchQuery,
            onRefresh: () => controller.loadCommunity(announce: false),
          ),
          _MyFilmsView(
            username: state.username,
            films: state.visibleMyFilms,
            totalFilmCount: state.myFilms.length,
            filter: state.myFilmFilter,
            isSignedIn: state.isSignedIn,
            isLoaded: state.myFilmsLoaded,
            onRefresh: () => controller.loadMyFilms(announce: false),
            onOpenAccount: () => controller.selectTab(2),
            onAddFilm: _openAddFilmSheet,
            onEditFilm: _editRating,
            onFilterChanged: controller.setMyFilmFilter,
            onFavorite: (film) =>
                controller.patchFilm(film, favorite: !film.favorite),
            onWatched: (film) => controller.patchFilm(film, watched: true),
            onDelete: _deleteFilm,
          ),
          _AccountView(
            formKey: _loginFormKey,
            usernameController: _usernameController,
            passwordController: _passwordController,
            username: state.username,
            isSignedIn: state.isSignedIn,
            isLoading: state.isLoading,
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
      floatingActionButton: state.selectedTab == 1 && state.isSignedIn
          ? FloatingActionButton.extended(
              key: const Key('addFilmFab'),
              onPressed: state.isLoading ? null : _openAddFilmSheet,
              icon: const Icon(Icons.add_rounded),
              label: const Text('Add a film'),
            )
          : null,
      bottomNavigationBar: NavigationBar(
        selectedIndex: state.selectedTab,
        onDestinationSelected: controller.selectTab,
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
