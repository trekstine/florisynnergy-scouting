import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../theme.dart';
import '../view_models/login_view_model.dart';
import '../widgets/form_widgets.dart';
import 'home_screen.dart';

/// Sign-in, in the Bloom visual language: white page, flat bordered card,
/// labeled fields with surface-filled inputs, full-width primary button.
class ScoutLoginScreen extends ConsumerWidget {
  const ScoutLoginScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(loginViewModelProvider);
    final viewModel = ref.read(loginViewModelProvider.notifier);

    return Scaffold(
      backgroundColor: kSurface,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // The registered trademark, used as supplied — the login
                  // screen is where the brand should read as itself.
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Image.asset(
                      'assets/logo-lockup.png',
                      height: 74,
                      fit: BoxFit.contain,
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text('Welcome back', style: kDisplay()),
                  const SizedBox(height: 8),
                  Text(
                    'Sign in with your device credentials to continue.',
                    style: kBody(color: kTextSecondary),
                  ),
                  const SizedBox(height: 24),
                  Container(
                    decoration: BoxDecoration(
                      color: kBackground,
                      borderRadius: BorderRadius.circular(kRadiusLg),
                      border: Border.all(color: kBorder),
                    ),
                    padding: const EdgeInsets.all(18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Backend URL',
                            style: kLabel(color: kTextSecondary)),
                        const SizedBox(height: 8),
                        TextFormField(
                          controller: state.baseUrlController,
                          style: kBody(),
                          decoration: inputDeco(prefixIcon: Icons.language)
                              .copyWith(hintText: 'https://…'),
                        ),
                        const SizedBox(height: 16),
                        Text('Device ID',
                            style: kLabel(color: kTextSecondary)),
                        const SizedBox(height: 8),
                        TextFormField(
                          controller: state.deviceIdController,
                          style: kBody(),
                          decoration: inputDeco(
                                  prefixIcon: Icons.phone_android_outlined)
                              .copyWith(hintText: 'scout-device-01'),
                        ),
                        const SizedBox(height: 16),
                        Text('PIN', style: kLabel(color: kTextSecondary)),
                        const SizedBox(height: 8),
                        TextFormField(
                          controller: state.pinController,
                          obscureText: true,
                          keyboardType: TextInputType.number,
                          style: kBody(),
                          decoration: inputDeco(prefixIcon: Icons.lock_outline)
                              .copyWith(hintText: '••••'),
                        ),
                        if (state.errorMessage != null) ...[
                          const SizedBox(height: 14),
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: kError.withOpacity(0.06),
                              borderRadius: BorderRadius.circular(kRadius),
                              border:
                                  Border.all(color: kError.withOpacity(0.25)),
                            ),
                            child: Text(
                              state.errorMessage!,
                              style: kCaption(color: kError),
                            ),
                          ),
                        ],
                        const SizedBox(height: 20),
                        ElevatedButton(
                          onPressed: state.isLoading
                              ? null
                              : () async {
                                  final success =
                                      await viewModel.submitLogin();
                                  if (!success || !context.mounted) return;
                                  Navigator.of(context).pushReplacement(
                                    MaterialPageRoute(
                                      builder: (_) => const HomeScreen(),
                                    ),
                                  );
                                },
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
                  const SizedBox(height: 20),
                  Center(
                    child: Text(
                      '© 2026 FloriSynergy IPM',
                      style: kCaption(),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
