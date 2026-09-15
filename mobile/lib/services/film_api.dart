import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/film.dart';

class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

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
  factory CatalogMovie.fromJson(Map<String, dynamic> json) => CatalogMovie(
    id: json['id'] as int,
    title: json['title'] as String,
    releaseDate: json['releaseDate']?.toString() ?? '',
    posterUrl: json['posterUrl']?.toString(),
  );
}

class FilmApi {
  FilmApi({http.Client? client, String? baseUrl})
    : _client = client ?? http.Client(),
      baseUrl = (baseUrl ?? _defaultBaseUrl()).replaceFirst(RegExp(r'/$'), '');

  final http.Client _client;
  final String baseUrl;

  static String _defaultBaseUrl() {
    const configuredUrl = String.fromEnvironment('API_BASE_URL');

    if (configuredUrl.isNotEmpty) {
      return configuredUrl;
    }

    return 'http://10.0.2.2:8080/api/v1';
  }

  Future<List<Film>> getCommunityFilms() async {
    final response = await _client.get(Uri.parse('$baseUrl/films'));
    return _decodeFilmList(response);
  }

  Future<String> login(String username, String password) {
    return _authenticate('/login', username, password);
  }

  Future<String> register(String username, String password) {
    return _authenticate('/register', username, password);
  }

  Future<String> _authenticate(
    String path,
    String username,
    String password,
  ) async {
    final response = await _client.post(
      Uri.parse('$baseUrl$path'),
      headers: _jsonHeaders(),
      body: jsonEncode({'username': username, 'password': password}),
    );
    final data = _decodeObject(response);
    final token = data['token']?.toString() ?? '';

    if (token.isEmpty) {
      throw const ApiException('The server did not return a login token.');
    }

    return token;
  }

  Future<List<Film>> getMyFilms(String token) async {
    final response = await _client.get(
      Uri.parse('$baseUrl/films/mine'),
      headers: _jsonHeaders(token),
    );
    return _decodeFilmList(response);
  }

  Future<List<CatalogMovie>> searchMovies(String query) async {
    final uri = Uri.parse('$baseUrl/movies')
        .replace(queryParameters: {'q': query});
    final data = _decodeObject(await _client.get(uri));
    final results = data['results'];
    if (results is! List) {
      throw const ApiException('Invalid movie search response.');
    }
    return results
        .whereType<Map<String, dynamic>>()
        .map(CatalogMovie.fromJson)
        .toList(growable: false);
  }

  Future<Film> addFilm({
    required String token,
    required int tmdbId,
    int? rating,
  }) async {
    final response = await _client.post(
      Uri.parse('$baseUrl/films'),
      headers: _jsonHeaders(token),
      body: jsonEncode({'tmdbId': tmdbId, 'rating': ?rating}),
    );
    return Film.fromJson(_decodeObject(response));
  }

  Future<Film> updateRating({
    required String token,
    required String filmId,
    required int rating,
  }) async {
    final response = await _client.put(
      Uri.parse('$baseUrl/films/$filmId/rating'),
      headers: _jsonHeaders(token),
      body: jsonEncode({'rating': rating}),
    );
    return Film.fromJson(_decodeObject(response));
  }

  Future<Film> updateFilm({
    required String token,
    required String filmId,
    bool? watched,
    bool? favorite,
    int? rating,
  }) async {
    final response = await _client.patch(
      Uri.parse('$baseUrl/films/$filmId'),
      headers: _jsonHeaders(token),
      body: jsonEncode({
        'watched': ?watched,
        'favorite': ?favorite,
        'rating': ?rating,
      }),
    );
    return Film.fromJson(_decodeObject(response));
  }

  Future<bool> deleteFilm({
    required String token,
    required String filmId,
  }) async {
    final response = await _client.delete(
      Uri.parse('$baseUrl/films/$filmId'),
      headers: _jsonHeaders(token),
    );
    _throwForError(response);
    return true;
  }

  Map<String, String> _jsonHeaders([String? token]) {
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  List<Film> _decodeFilmList(http.Response response) {
    _throwForError(response);

    final data = jsonDecode(response.body);
    if (data is! List) {
      throw const ApiException('The server returned an invalid film list.');
    }

    return data
        .whereType<Map<String, dynamic>>()
        .map(Film.fromJson)
        .toList(growable: false);
  }

  Map<String, dynamic> _decodeObject(http.Response response) {
    _throwForError(response);

    final data = jsonDecode(response.body);
    if (data is! Map<String, dynamic>) {
      throw const ApiException('The server returned an invalid response.');
    }

    return data;
  }

  void _throwForError(http.Response response) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return;
    }

    var message = 'Request failed with status ${response.statusCode}.';

    try {
      final data = jsonDecode(response.body);
      if (data is Map<String, dynamic> && data['error'] is String) {
        message = data['error'] as String;
      }
    } on FormatException {
      // Keep the status-based fallback when an upstream returns non-JSON text.
    }

    throw ApiException(message, statusCode: response.statusCode);
  }
}
