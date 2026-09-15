part of 'home_screen.dart';

class _AdaptiveFilmGrid extends StatelessWidget {
  const _AdaptiveFilmGrid({
    required this.films,
    required this.showCommunityAverage,
    this.onEdit,
    this.onFavorite,
    this.onWatched,
    this.onDelete,
  });

  final List<Film> films;
  final bool showCommunityAverage;
  final ValueChanged<Film>? onEdit;
  final ValueChanged<Film>? onFavorite;
  final ValueChanged<Film>? onWatched;
  final ValueChanged<Film>? onDelete;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final cardWidth = constraints.maxWidth >= 680
            ? (constraints.maxWidth - 12) / 2
            : constraints.maxWidth;

        return Wrap(
          spacing: 12,
          runSpacing: 12,
          children: films
              .map(
                (film) => SizedBox(
                  width: cardWidth,
                  child: _FilmCard(
                    film: film,
                    showCommunityAverage: showCommunityAverage,
                    onEdit: onEdit == null ? null : () => onEdit!(film),
                    onFavorite: onFavorite == null
                        ? null
                        : () => onFavorite!(film),
                    onWatched: onWatched == null
                        ? null
                        : () => onWatched!(film),
                    onDelete: onDelete == null ? null : () => onDelete!(film),
                  ),
                ),
              )
              .toList(growable: false),
        );
      },
    );
  }
}

class _FilmCard extends StatelessWidget {
  const _FilmCard({
    required this.film,
    required this.showCommunityAverage,
    this.onEdit,
    this.onFavorite,
    this.onWatched,
    this.onDelete,
  });

  final Film film;
  final bool showCommunityAverage;
  final VoidCallback? onEdit;
  final VoidCallback? onFavorite;
  final VoidCallback? onWatched;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final ratingLabel = film.rating == null
        ? 'SAVE'
        : showCommunityAverage
        ? film.rating!.toStringAsFixed(1)
        : film.rating!.toStringAsFixed(0);
    final ratingCount = film.ratingCount ?? 0;

    return Card(
      margin: EdgeInsets.zero,
      color: const Color(0xFF15171E),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: const BorderSide(color: Color(0xFF3A3C44)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onEdit,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 58,
                height: 58,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFFE50914), Color(0xFFA30A14)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        ratingLabel,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 20,
                          height: 1,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        film.rating == null ? 'WATCHLIST' : '/ 10',
                        style: TextStyle(
                          color: Color(0xFFFFDADD),
                          fontSize: 9,
                          height: 1,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      film.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Icon(
                          showCommunityAverage
                              ? Icons.people_alt_outlined
                              : Icons.person_outline_rounded,
                          size: 16,
                          color: const Color(0xFF9299AD),
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            showCommunityAverage
                                ? '$ratingCount community '
                                      'rating${ratingCount == 1 ? '' : 's'}'
                                : film.watched
                                ? 'Watched 🍿'
                                : 'Watchlist 🎬',
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Color(0xFF9299AD),
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              if (onFavorite != null)
                IconButton(
                  tooltip: film.favorite ? 'Remove favorite' : 'Add favorite',
                  onPressed: onFavorite,
                  icon: Icon(
                    film.favorite
                        ? Icons.star_rounded
                        : Icons.star_border_rounded,
                    color: film.favorite ? const Color(0xFFFFD66B) : null,
                  ),
                ),
              if (onEdit != null)
                PopupMenuButton<String>(
                  tooltip: 'Movie actions',
                  onSelected: (action) {
                    if (action == 'rate') onEdit!();
                    if (action == 'watched') onWatched?.call();
                    if (action == 'delete') onDelete?.call();
                  },
                  itemBuilder: (_) => [
                    const PopupMenuItem(
                      value: 'rate',
                      child: Text('Rate or rerate'),
                    ),
                    if (!film.watched)
                      const PopupMenuItem(
                        value: 'watched',
                        child: Text('Mark watched'),
                      ),
                    const PopupMenuItem(
                      value: 'delete',
                      child: Text('Remove from shelf'),
                    ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyCard extends StatelessWidget {
  const _EmptyCard({
    required this.icon,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
      decoration: BoxDecoration(
        color: const Color(0xFF15171E),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFF3A3C44)),
      ),
      child: Column(
        children: [
          Icon(icon, size: 42, color: const Color(0xFFE50914)),
          const SizedBox(height: 14),
          Text(
            title,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleLarge
                ?.copyWith(fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 8),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Color(0xFFADB4C8), height: 1.45),
          ),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: onAction,
              icon: const Icon(Icons.arrow_forward_rounded),
              label: Text(actionLabel!),
            ),
          ],
        ],
      ),
    );
  }
}

class _LoadingShelf extends StatelessWidget {
  const _LoadingShelf();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 52),
      child: Center(child: CircularProgressIndicator()),
    );
  }
}
