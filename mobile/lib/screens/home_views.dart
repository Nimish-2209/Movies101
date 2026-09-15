part of 'home_screen.dart';

class _DiscoverView extends StatelessWidget {
  const _DiscoverView({
    required this.films,
    required this.totalFilmCount,
    required this.isLoaded,
    required this.searchQuery,
    required this.onSearchChanged,
    required this.onRefresh,
  });

  final List<Film> films;
  final int totalFilmCount;
  final bool isLoaded;
  final String searchQuery;
  final ValueChanged<String> onSearchChanged;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        key: const PageStorageKey('discover-feed'),
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(18, 12, 18, 32),
        children: [
          _DiscoverySpotlight(filmCount: totalFilmCount),
          const SizedBox(height: 18),
          SearchBar(
            leading: const Icon(Icons.search_rounded),
            hintText: 'Search the community shelf',
            onChanged: onSearchChanged,
            trailing: searchQuery.isEmpty
                ? const []
                : [
                    IconButton(
                      tooltip: 'Clear search',
                      onPressed: () => onSearchChanged(''),
                      icon: const Icon(Icons.close_rounded),
                    ),
                  ],
          ),
          const SizedBox(height: 22),
          Row(
            children: [
              Expanded(
                child: Text(
                  searchQuery.isEmpty ? 'Community picks' : 'Search results',
                  style: Theme.of(context).textTheme.titleLarge
                      ?.copyWith(fontWeight: FontWeight.w900),
                ),
              ),
              if (isLoaded)
                Text(
                  '${films.length} film${films.length == 1 ? '' : 's'}',
                  style: const TextStyle(
                    color: Color(0xFF9299AD),
                    fontWeight: FontWeight.w700,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          if (!isLoaded)
            const _LoadingShelf()
          else if (films.isEmpty)
            _EmptyCard(
              icon: Icons.search_off_rounded,
              title: searchQuery.isEmpty
                  ? 'No films are showing yet'
                  : 'No matching films',
              message: searchQuery.isEmpty
                  ? 'Pull down to check the community shelf again.'
                  : 'Try a different title.',
            )
          else
            _AdaptiveFilmGrid(films: films, showCommunityAverage: true),
        ],
      ),
    );
  }
}

class _DiscoverySpotlight extends StatelessWidget {
  const _DiscoverySpotlight({required this.filmCount});

  final int filmCount;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFE50914), Color(0xFF5A0A12)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(28),
        boxShadow: const [
          BoxShadow(
            color: Color(0x55E50914),
            blurRadius: 28,
            offset: Offset(0, 14),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'BROWSE COMMUNITY FILMS',
                  style: TextStyle(
                    color: Color(0xFFFFDADD),
                    fontSize: 11,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.5,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  'Find your next watch',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  filmCount == 0
                      ? 'Community ratings will appear here.'
                      : '$filmCount titles, ranked by movie fans.',
                  style: const TextStyle(color: Color(0xFFF5E7E8)),
                ),
              ],
            ),
          ),
          const SizedBox(width: 16),
          Container(
            width: 64,
            height: 64,
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.13),
              shape: BoxShape.circle,
            ),
            child: Image.asset(
              'assets/movies101_clapperboard.png',
              fit: BoxFit.cover,
            ),
          ),
        ],
      ),
    );
  }
}

class _MyFilmsView extends StatelessWidget {
  const _MyFilmsView({
    required this.username,
    required this.films,
    required this.totalFilmCount,
    required this.filter,
    required this.isSignedIn,
    required this.isLoaded,
    required this.onRefresh,
    required this.onOpenAccount,
    required this.onAddFilm,
    required this.onEditFilm,
    required this.onFilterChanged,
    required this.onFavorite,
    required this.onWatched,
    required this.onDelete,
  });

  final String? username;
  final List<Film> films;
  final int totalFilmCount;
  final String filter;
  final bool isSignedIn;
  final bool isLoaded;
  final Future<void> Function() onRefresh;
  final VoidCallback onOpenAccount;
  final VoidCallback onAddFilm;
  final ValueChanged<Film> onEditFilm;
  final ValueChanged<String> onFilterChanged;
  final ValueChanged<Film> onFavorite;
  final ValueChanged<Film> onWatched;
  final ValueChanged<Film> onDelete;

  @override
  Widget build(BuildContext context) {
    if (!isSignedIn) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(18),
        children: [
          const SizedBox(height: 48),
          _EmptyCard(
            icon: Icons.lock_outline_rounded,
            title: 'Your shelf is private',
            message:
                'Sign in to add films and keep your personal ratings together.',
            actionLabel: 'Go to Account',
            onAction: onOpenAccount,
          ),
        ],
      );
    }

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        key: const PageStorageKey('my-films'),
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(18, 12, 18, 100),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: const Color(0xFF1A1D25),
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: const Color(0xFF3A3C44)),
            ),
            child: Row(
              children: [
                const CircleAvatar(
                  radius: 24,
                  backgroundColor: Color(0xFF351118),
                  child: Icon(
                    Icons.bookmarks_rounded,
                    color: Color(0xFFFF777E),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Signed in as $username',
                        style: const TextStyle(
                          color: Color(0xFF72E6B1),
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        '$totalFilmCount saved '
                        'film${totalFilmCount == 1 ? '' : 's'}',
                        style: Theme.of(context).textTheme.titleLarge
                            ?.copyWith(fontWeight: FontWeight.w900),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          Row(
            children: [
              Expanded(
                child: Text(
                  'My cinematic universe',
                  style: Theme.of(context).textTheme.titleLarge
                      ?.copyWith(fontWeight: FontWeight.w900),
                ),
              ),
              if (films.isNotEmpty)
                const Text(
                  'Tap ✎ to update',
                  style: TextStyle(
                    color: Color(0xFF9299AD),
                    fontWeight: FontWeight.w600,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                for (final choice in const [
                  ('all', 'Everything'),
                  ('watchlist', 'Watchlist'),
                  ('watched', 'Watched'),
                  ('favorites', 'Favorites ★'),
                ]) ...[
                  ChoiceChip(
                    label: Text(choice.$2),
                    selected: filter == choice.$1,
                    onSelected: (_) => onFilterChanged(choice.$1),
                  ),
                  const SizedBox(width: 8),
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),
          if (!isLoaded)
            const _LoadingShelf()
          else if (films.isEmpty)
            _EmptyCard(
              icon: totalFilmCount == 0
                  ? Icons.bookmark_add_outlined
                  : Icons.movie_filter_outlined,
              title: totalFilmCount == 0
                  ? 'Opening scene needed'
                  : 'Nothing in this cut',
              message: totalFilmCount == 0
                  ? 'Save something for later or rate it while the credits are fresh.'
                  : 'Try another filter. The director insists.',
              actionLabel: totalFilmCount == 0 ? 'Add Film' : null,
              onAction: totalFilmCount == 0 ? onAddFilm : null,
            )
          else
            _AdaptiveFilmGrid(
              films: films,
              showCommunityAverage: false,
              onEdit: onEditFilm,
              onFavorite: onFavorite,
              onWatched: onWatched,
              onDelete: onDelete,
            ),
        ],
      ),
    );
  }
}

class _AccountView extends StatelessWidget {
  const _AccountView({
    required this.formKey,
    required this.usernameController,
    required this.passwordController,
    required this.username,
    required this.isSignedIn,
    required this.isLoading,
    required this.obscurePassword,
    required this.onTogglePassword,
    required this.onLogin,
    required this.onRegister,
    required this.onLogout,
    required this.validateUsername,
    required this.validatePassword,
  });

  final GlobalKey<FormState> formKey;
  final TextEditingController usernameController;
  final TextEditingController passwordController;
  final String? username;
  final bool isSignedIn;
  final bool isLoading;
  final bool obscurePassword;
  final VoidCallback onTogglePassword;
  final VoidCallback onLogin;
  final VoidCallback onRegister;
  final VoidCallback onLogout;
  final FormFieldValidator<String> validateUsername;
  final FormFieldValidator<String> validatePassword;

  @override
  Widget build(BuildContext context) {
    return ListView(
      key: const PageStorageKey('account'),
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 32),
      children: [
        if (isSignedIn)
          _SignedInAccount(username: username!, onLogout: onLogout)
        else ...[
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: const Color(0xFF1A1D25),
              borderRadius: BorderRadius.circular(26),
              border: Border.all(color: const Color(0xFF3A3C44)),
            ),
            child: Form(
              key: formKey,
              child: AutofillGroup(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const CircleAvatar(
                      radius: 28,
                      backgroundColor: Color(0xFF351118),
                      child: Icon(
                        Icons.person_rounded,
                        color: Color(0xFFFF777E),
                        size: 30,
                      ),
                    ),
                    const SizedBox(height: 18),
                    Text(
                      'Make it yours',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.headlineSmall
                          ?.copyWith(fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Sign in to build a film shelf and update your ratings.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Color(0xFFADB4C8), height: 1.45),
                    ),
                    const SizedBox(height: 24),
                    TextFormField(
                      key: const Key('usernameField'),
                      controller: usernameController,
                      autofillHints: const [AutofillHints.username],
                      decoration: const InputDecoration(
                        labelText: 'Username',
                        prefixIcon: Icon(Icons.alternate_email_rounded),
                      ),
                      textInputAction: TextInputAction.next,
                      validator: validateUsername,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      key: const Key('passwordField'),
                      controller: passwordController,
                      autofillHints: const [AutofillHints.password],
                      obscureText: obscurePassword,
                      decoration: InputDecoration(
                        labelText: 'Password',
                        helperText: 'Use 8 to 128 characters.',
                        prefixIcon: const Icon(Icons.lock_outline_rounded),
                        suffixIcon: IconButton(
                          tooltip: obscurePassword
                              ? 'Show password'
                              : 'Hide password',
                          onPressed: onTogglePassword,
                          icon: Icon(
                            obscurePassword
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined,
                          ),
                        ),
                      ),
                      textInputAction: TextInputAction.done,
                      validator: validatePassword,
                      onFieldSubmitted: (_) => onLogin(),
                    ),
                    const SizedBox(height: 18),
                    FilledButton.icon(
                      key: const Key('loginButton'),
                      onPressed: isLoading ? null : onLogin,
                      icon: const Icon(Icons.login_rounded),
                      label: const Text('Login'),
                    ),
                    const SizedBox(height: 10),
                    OutlinedButton.icon(
                      key: const Key('registerButton'),
                      onPressed: isLoading ? null : onRegister,
                      icon: const Icon(Icons.person_add_alt_1_rounded),
                      label: const Text('Sign Up'),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 18),
          const _GuestNote(),
        ],
      ],
    );
  }
}

class _SignedInAccount extends StatelessWidget {
  const _SignedInAccount({required this.username, required this.onLogout});

  final String username;
  final VoidCallback onLogout;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const SizedBox(height: 24),
        CircleAvatar(
          radius: 46,
          backgroundColor: const Color(0xFFE50914),
          child: Text(
            username[0].toUpperCase(),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 36,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
        const SizedBox(height: 18),
        Text(
          username,
          style: Theme.of(context).textTheme.headlineSmall
              ?.copyWith(fontWeight: FontWeight.w900),
        ),
        const SizedBox(height: 6),
        const Text(
          'Your Movies101 profile',
          style: TextStyle(color: Color(0xFFADB4C8)),
        ),
        const SizedBox(height: 30),
        const _InfoRow(
          icon: Icons.public_rounded,
          title: 'Community access',
          subtitle: 'Browse every shared film and average rating',
        ),
        const SizedBox(height: 12),
        const _InfoRow(
          icon: Icons.edit_note_rounded,
          title: 'Personal ratings',
          subtitle: 'Add films and revise only the ratings you own',
        ),
        const SizedBox(height: 28),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: onLogout,
            icon: const Icon(Icons.logout_rounded),
            label: const Text('Sign Out'),
          ),
        ),
      ],
    );
  }
}

class _GuestNote extends StatelessWidget {
  const _GuestNote();

  @override
  Widget build(BuildContext context) {
    return const _InfoRow(
      icon: Icons.explore_rounded,
      title: 'No account required to explore',
      subtitle: 'The Discover tab always shows community films.',
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF15171E),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFF3A3C44)),
      ),
      child: Row(
        children: [
          Icon(icon, color: const Color(0xFFFF777E)),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 3),
                Text(
                  subtitle,
                  style: const TextStyle(
                    color: Color(0xFF9299AD),
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
