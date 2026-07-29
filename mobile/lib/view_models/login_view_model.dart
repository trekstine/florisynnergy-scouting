import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api_service.dart';
import '../auth_store.dart';

final loginViewModelProvider =
    StateNotifierProvider<LoginViewModel, LoginViewState>(
      (_) => LoginViewModel(),
    );

class LoginViewState {
  LoginViewState({
    String? baseUrl,
    String? deviceId,
    String? pin,
    this.isLoading = false,
    this.errorMessage,
  }) : baseUrlController = TextEditingController(
         text: baseUrl ?? 'http://10.0.2.2:8000',
       ),
       deviceIdController = TextEditingController(
         text: deviceId ?? 'scout-device-01',
       ),
       pinController = TextEditingController(text: pin ?? '2001');

  final TextEditingController baseUrlController;
  final TextEditingController deviceIdController;
  final TextEditingController pinController;
  final bool isLoading;
  final String? errorMessage;

  LoginViewState copyWith({bool? isLoading, String? errorMessage}) {
    return LoginViewState(
      baseUrl: baseUrlController.text,
      deviceId: deviceIdController.text,
      pin: pinController.text,
      isLoading: isLoading ?? this.isLoading,
      errorMessage: errorMessage,
    );
  }
}

class LoginViewModel extends StateNotifier<LoginViewState> {
  LoginViewModel() : super(LoginViewState());

  Future<bool> submitLogin() async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    final api = ApiService(baseUrl: state.baseUrlController.text.trim());

    try {
      await api.healthCheck();
      final token = await api.login(
        state.deviceIdController.text.trim(),
        state.pinController.text.trim(),
      );
      await AuthSessionStore().saveSession(
        deviceId: state.deviceIdController.text.trim(),
        token: token,
      );
      return true;
    } catch (error) {
      state = state.copyWith(isLoading: false, errorMessage: error.toString());
      return false;
    }
  }
}
