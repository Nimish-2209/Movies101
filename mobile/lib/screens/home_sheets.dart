part of 'home_screen.dart';

class _FilmDraft {
  const _FilmDraft({required this.tmdbId, required this.rating});

  final int tmdbId;
  final int? rating;
}

class _AddFilmSheet extends StatefulWidget {
  const _AddFilmSheet({required this.api});
  final FilmApi api;

  @override
  State<_AddFilmSheet> createState() => _AddFilmSheetState();
}

class _AddFilmSheetState extends State<_AddFilmSheet> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  double _rating = 7;
  List<CatalogMovie> _matches = const [];
  CatalogMovie? _selectedMovie;
  String? _searchError;
  bool _searching = false;
  Timer? _searchDebounce;

  Future<void> _search() async {
    final query = _titleController.text.trim();
    if (query.length < 2) {
      setState(() {
        _matches = const [];
        _selectedMovie = null;
        _searchError = null;
      });
      return;
    }
    setState(() {
      _searching = true;
      _searchError = null;
      _selectedMovie = null;
    });
    try {
      final movies = await widget.api.searchMovies(query);
      if (mounted) {
        setState(() => _matches = movies);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _searchError = 'Could not search movies. Try again.');
      }
    } finally {
      if (mounted) {
        setState(() => _searching = false);
      }
    }
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _titleController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        4,
        20,
        20 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'Add to my shelf',
                      style: Theme.of(context).textTheme.headlineSmall
                          ?.copyWith(fontWeight: FontWeight.w900),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Close',
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              const Text(
                'Type a title. We’ll roll the choices before you finish the trailer.',
                style: TextStyle(color: Color(0xFFADB4C8)),
              ),
              const SizedBox(height: 22),
              TextFormField(
                key: const Key('filmTitleField'),
                controller: _titleController,
                autofocus: true,
                decoration: const InputDecoration(
                  labelText: 'Search movie title',
                  prefixIcon: Icon(Icons.movie_creation_outlined),
                ),
                textInputAction: TextInputAction.search,
                onFieldSubmitted: (_) => _search(),
                onChanged: (_) {
                  _searchDebounce?.cancel();
                  setState(() {
                    _selectedMovie = null;
                    _matches = const [];
                  });
                  _searchDebounce = Timer(
                    const Duration(milliseconds: 350),
                    _search,
                  );
                },
              ),
              const SizedBox(height: 10),
              if (_searching) const LinearProgressIndicator(),
              if (_searchError != null) Text(_searchError!),
              if (_matches.isNotEmpty)
                SizedBox(
                  height: 180,
                  child: ListView.builder(
                    itemCount: _matches.length,
                    itemBuilder: (context, index) {
                      final movie = _matches[index];
                      return ListTile(
                        leading: ClipRRect(
                          borderRadius: BorderRadius.circular(6),
                          child: movie.posterUrl == null
                              ? Container(
                                  width: 40,
                                  height: 60,
                                  color: const Color(0xFF2B2E38),
                                  child: const Icon(Icons.movie_outlined),
                                )
                              : Image.network(
                                  movie.posterUrl!,
                                  width: 40,
                                  height: 60,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, _, _) => Container(
                                    width: 40,
                                    height: 60,
                                    color: const Color(0xFF2B2E38),
                                    child: const Icon(Icons.movie_outlined),
                                  ),
                                ),
                        ),
                        title: Text(movie.title),
                        subtitle: Text(
                          movie.releaseDate.isEmpty
                              ? 'Release date unknown'
                              : movie.releaseDate.substring(0, 4),
                        ),
                        selected: _selectedMovie?.id == movie.id,
                        onTap: () => setState(() => _selectedMovie = movie),
                      );
                    },
                  ),
                ),
              if (_selectedMovie != null)
                Text(
                  'Selected: ${_selectedMovie!.title} (${_selectedMovie!.releaseDate.isEmpty ? 'year unknown' : _selectedMovie!.releaseDate.substring(0, 4)})',
                ),
              const SizedBox(height: 22),
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Your rating',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                  _RatingPill(rating: _rating.round()),
                ],
              ),
              Slider(
                value: _rating,
                min: 0,
                max: 10,
                divisions: 10,
                label: _rating.round().toString(),
                onChanged: (value) => setState(() => _rating = value),
              ),
              const Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('0', style: TextStyle(color: Color(0xFF9299AD))),
                  Text('10', style: TextStyle(color: Color(0xFF9299AD))),
                ],
              ),
              const SizedBox(height: 20),
              OutlinedButton.icon(
                key: const Key('saveWatchlistButton'),
                onPressed: _selectedMovie == null
                    ? null
                    : () {
                        Navigator.of(context).pop(
                          _FilmDraft(tmdbId: _selectedMovie!.id, rating: null),
                        );
                      },
                icon: const Icon(Icons.bookmark_add_outlined),
                label: const Text('Save to Watchlist'),
              ),
              const SizedBox(height: 10),
              FilledButton.icon(
                key: const Key('addFilmButton'),
                onPressed: _selectedMovie == null
                    ? null
                    : () {
                        Navigator.of(context).pop(
                          _FilmDraft(
                            tmdbId: _selectedMovie!.id,
                            rating: _rating.round(),
                          ),
                        );
                      },
                icon: const Icon(Icons.star_rate_rounded),
                label: const Text('Rate & Add'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RatingSheet extends StatefulWidget {
  const _RatingSheet({required this.film});

  final Film film;

  @override
  State<_RatingSheet> createState() => _RatingSheetState();
}

class _RatingSheetState extends State<_RatingSheet> {
  late double _rating;

  @override
  void initState() {
    super.initState();
    _rating = (widget.film.rating ?? 7).roundToDouble().clamp(0, 10);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Rate ${widget.film.name}',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.headlineSmall
                      ?.copyWith(fontWeight: FontWeight.w900),
                ),
              ),
              IconButton(
                tooltip: 'Close',
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.close_rounded),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Center(child: _RatingPill(rating: _rating.round(), large: true)),
          const SizedBox(height: 16),
          Slider(
            value: _rating,
            min: 0,
            max: 10,
            divisions: 10,
            label: _rating.round().toString(),
            onChanged: (value) => setState(() => _rating = value),
          ),
          const Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Not for me', style: TextStyle(color: Color(0xFF9299AD))),
              Text('Loved it', style: TextStyle(color: Color(0xFF9299AD))),
            ],
          ),
          const SizedBox(height: 24),
          FilledButton.icon(
            key: const Key('saveRatingButton'),
            onPressed: () => Navigator.of(context).pop(_rating.round()),
            icon: const Icon(Icons.check_rounded),
            label: const Text('Save rating'),
          ),
        ],
      ),
    );
  }
}

class _RatingPill extends StatelessWidget {
  const _RatingPill({required this.rating, this.large = false});

  final int rating;
  final bool large;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: large ? 24 : 14,
        vertical: large ? 14 : 8,
      ),
      decoration: BoxDecoration(
        color: const Color(0xFF351118),
        borderRadius: BorderRadius.circular(99),
        border: Border.all(color: const Color(0xFFA30A14)),
      ),
      child: Text(
        '$rating / 10',
        style: TextStyle(
          color: const Color(0xFFFFC4C8),
          fontSize: large ? 26 : 15,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}
