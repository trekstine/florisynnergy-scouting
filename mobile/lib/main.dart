import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth_store.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';

void main() {
  runApp(const ProviderScope(child: ScoutApp()));
}

class ScoutApp extends StatelessWidget {
  const ScoutApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FloriSynergy Scout',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: const ColorScheme.light(
          primary: Color(0xFF2E7D32),
          onPrimary: Colors.white,
          secondary: Color(0xFF1B5E20),
          surface: Colors.white,
          onSurface: Color(0xFF212121),
        ),
        scaffoldBackgroundColor: const Color(0xFFF6F7F2),
        useMaterial3: true,
        cardTheme: const CardThemeData(
          elevation: 4,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(20)),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xFFF3F5EE),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(16),
            borderSide: BorderSide.none,
          ),
        ),
      ),
      home: const _LaunchGate(),
    );
  }
}

/// Skips straight to the home screen for a scout who's already signed in —
/// re-entering a device PIN every time the app is reopened mid-shift is
/// exactly the kind of friction this rebuild is meant to remove.
class _LaunchGate extends StatelessWidget {
  const _LaunchGate();

  @override
  Widget build(BuildContext context) {
    return FutureBuilder(
      future: AuthSessionStore().loadSession(),
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        return snapshot.data != null ? const HomeScreen() : const ScoutLoginScreen();
      },
    );
  }
}
