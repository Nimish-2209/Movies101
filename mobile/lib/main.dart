import 'package:flutter/material.dart';

import 'screens/home_screen.dart';
import 'services/film_api.dart';

void main() {
  runApp(const Movies101App());
}

class Movies101App extends StatelessWidget {
  const Movies101App({super.key, this.api});

  final FilmApi? api;

  @override
  Widget build(BuildContext context) {
    const accent = Color(0xFFE50914);
    final colorScheme = ColorScheme.fromSeed(
      seedColor: accent,
      brightness: Brightness.dark,
      surface: const Color(0xFF15171E),
    );

    return MaterialApp(
      title: 'Movies101',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorScheme: colorScheme,
        scaffoldBackgroundColor: const Color(0xFF08090D),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF08090D),
          foregroundColor: Color(0xFFF7F7FB),
          elevation: 0,
          scrolledUnderElevation: 0,
        ),
        navigationBarTheme: NavigationBarThemeData(
          backgroundColor: const Color(0xFF15171E),
          indicatorColor: accent.withValues(alpha: 0.2),
          labelTextStyle: WidgetStateProperty.resolveWith((states) {
            return TextStyle(
              color: states.contains(WidgetState.selected)
                  ? const Color(0xFFF7F7FB)
                  : const Color(0xFFAAA9A6),
              fontWeight: states.contains(WidgetState.selected)
                  ? FontWeight.w800
                  : FontWeight.w600,
            );
          }),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xFF0D0F14),
          labelStyle: const TextStyle(color: Color(0xFFC5C3C0)),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: const BorderSide(color: Color(0xFF3B3D45)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: const BorderSide(color: Color(0xFF3B3D45)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: const BorderSide(color: accent, width: 1.6),
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            minimumSize: const Size(0, 50),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
            textStyle: const TextStyle(fontWeight: FontWeight.w800),
          ),
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: const Color(0xFFF5F4F1),
            minimumSize: const Size(0, 50),
            side: const BorderSide(color: accent),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
            textStyle: const TextStyle(fontWeight: FontWeight.w800),
          ),
        ),
        snackBarTheme: const SnackBarThemeData(
          behavior: SnackBarBehavior.floating,
          backgroundColor: Color(0xFF1F222B),
          contentTextStyle: TextStyle(color: Color(0xFFF7F7FB)),
        ),
        bottomSheetTheme: const BottomSheetThemeData(
          backgroundColor: Color(0xFF15171E),
          modalBackgroundColor: Color(0xFF15171E),
          showDragHandle: true,
        ),
      ),
      home: MoviesHomeScreen(api: api),
    );
  }
}
