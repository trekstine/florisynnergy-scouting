import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../view_models/login_view_model.dart';
import 'capture_screen.dart';

class ScoutLoginScreen extends ConsumerWidget {
  const ScoutLoginScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(loginViewModelProvider);
    final viewModel = ref.read(loginViewModelProvider.notifier);

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: 12),
                const Align(
                  alignment: Alignment.centerLeft,
                  child: CircleAvatar(
                    radius: 32,
                    backgroundColor: Color(0xFFE7F5E9),
                    child: Icon(
                      Icons.agriculture,
                      size: 32,
                      color: Color(0xFF2E7D32),
                    ),
                  ),
                ),
                const SizedBox(height: 24),
                const Text(
                  'Welcome back',
                  style: TextStyle(
                    fontSize: 34,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF1A3A20),
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Sign in to your account to continue.',
                  style: TextStyle(fontSize: 16, color: Color(0xFF556756)),
                ),
                const SizedBox(height: 32),
                _StyledCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      TextFormField(
                        controller: state.baseUrlController,
                        decoration: const InputDecoration(
                          labelText: 'Backend URL',
                          prefixIcon: Icon(Icons.language),
                        ),
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: state.deviceIdController,
                        decoration: const InputDecoration(
                          labelText: 'Device ID',
                          prefixIcon: Icon(Icons.device_hub),
                        ),
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: state.pinController,
                        decoration: const InputDecoration(
                          labelText: 'PIN',
                          prefixIcon: Icon(Icons.lock),
                        ),
                        obscureText: true,
                      ),
                      const SizedBox(height: 24),
                      if (state.errorMessage != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 16),
                          child: Text(
                            state.errorMessage!,
                            style: const TextStyle(
                              color: Colors.redAccent,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      FilledButton(
                        onPressed: state.isLoading
                            ? null
                            : () async {
                                final success = await viewModel.submitLogin();
                                if (!success || !context.mounted) return;
                                Navigator.of(context).pushReplacement(
                                  MaterialPageRoute(
                                    builder: (_) => const ScoutCaptureScreen(),
                                  ),
                                );
                              },
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFF2E7D32),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                          padding: const EdgeInsets.symmetric(vertical: 16),
                        ),
                        child: state.isLoading
                            ? const SizedBox(
                                height: 18,
                                width: 18,
                                child: CircularProgressIndicator(
                                  color: Colors.white,
                                  strokeWidth: 2,
                                ),
                              )
                            : const Text('Sign in'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 22),
                const Text(
                  '© 2026 Florisynergy Scouting. All rights reserved.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Color(0xFF8A9A88)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StyledCard extends StatelessWidget {
  const _StyledCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Card(
      color: Colors.white,
      elevation: 4,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      child: Padding(padding: const EdgeInsets.all(20), child: child),
    );
  }
}
