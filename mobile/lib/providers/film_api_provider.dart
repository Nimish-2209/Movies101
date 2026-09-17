import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/film_api.dart';

final filmApiProvider = Provider<FilmApi>((ref) {
  final api = FilmApi();
  ref.onDispose(api.close);
  return api;
});
