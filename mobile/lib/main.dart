import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth_store.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'theme.dart';

void main() {
  runApp(const ProviderScope(child: ScoutApp()));
}

class ScoutApp extends StatelessWidget {
  const ScoutApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'FloriSynergy IPM',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      home: const _LaunchGate(),
    );
  }
}

/// Skips straight to the home screen for a scout who's already signed in.
class _LaunchGate extends StatelessWidget {
  const _LaunchGate();

  @override
  Widget build(BuildContext context) {
    return FutureBuilder(
      future: AuthSessionStore().loadSession(),
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Scaffold(
            body: Center(
              child: CircularProgressIndicator(
                color: kPrimary,
                strokeWidth: 1.5,
              ),
            ),
          );
        }
        return snapshot.data != null
            ? const HomeScreen()
            : const ScoutLoginScreen();
      },
    );
  }
}
