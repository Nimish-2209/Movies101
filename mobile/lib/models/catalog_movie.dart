class CatalogMovie {
  const CatalogMovie({
    required this.id,
    required this.title,
    required this.releaseDate,
    this.posterUrl,
  });

  final int id;
  final String title;
  final String releaseDate;
  final String? posterUrl;

  factory CatalogMovie.fromJson(Map<String, dynamic> json) {
    return CatalogMovie(
      id: json['id'] as int,
      title: json['title'] as String,
      releaseDate: json['releaseDate']?.toString() ?? '',
      posterUrl: json['posterUrl']?.toString(),
    );
  }
}
