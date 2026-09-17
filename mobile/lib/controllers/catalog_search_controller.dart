import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/catalog_movie.dart';
import '../providers/film_api_provider.dart';

final catalogSearchProvider =
    AsyncNotifierProvider.autoDispose<
      CatalogSearchController,
      List<CatalogMovie>
    >(CatalogSearchController.new);

class CatalogSearchController extends AsyncNotifier<List<CatalogMovie>> {
  int _requestId = 0;

  @override
  FutureOr<List<CatalogMovie>> build() => const [];

  void clear() {
    _requestId++;
    state = const AsyncData([]);
  }

  Future<void> search(String rawQuery) async {
    final query = rawQuery.trim();
    if (query.length < 2) {
      clear();
      return;
    }

    final requestId = ++_requestId;
    state = const AsyncLoading();
    try {
      final movies = await ref.read(filmApiProvider).searchMovies(query);
      if (requestId == _requestId) state = AsyncData(movies);
    } catch (error, stackTrace) {
      if (requestId == _requestId) {
        state = AsyncError(error, stackTrace);
      }
    }
  }
}
