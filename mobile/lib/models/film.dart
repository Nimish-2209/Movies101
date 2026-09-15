class Film {
  const Film({
    required this.id,
    required this.name,
    this.rating,
    this.owner = 'Community',
    this.ratingCount,
    this.posterUrl,
    this.releaseDate = '',
    this.watched = false,
    this.favorite = false,
  });

  final String id;
  final String name;
  final double? rating;
  final String owner;
  final int? ratingCount;
  final String? posterUrl;
  final String releaseDate;
  final bool watched;
  final bool favorite;

  factory Film.fromJson(Map<String, dynamic> json) {
    final rawRating = json['rating'];
    return Film(
      id: json['_id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Untitled film',
      rating: rawRating is num ? rawRating.toDouble() : null,
      owner: json['owner']?.toString() ?? 'Community',
      ratingCount: json['ratingCount'] is num
          ? (json['ratingCount'] as num).toInt()
          : null,
      posterUrl: json['posterUrl']?.toString(),
      releaseDate: json['releaseDate']?.toString() ?? '',
      watched: json['watched'] == true,
      favorite: json['favorite'] == true,
    );
  }
}
