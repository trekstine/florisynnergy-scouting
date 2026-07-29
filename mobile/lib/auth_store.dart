import 'package:shared_preferences/shared_preferences.dart';

class AuthSession {
  AuthSession({required this.deviceId, required this.token});

  final String deviceId;
  final String token;
}

class AuthSessionStore {
  Future<void> saveSession({
    required String deviceId,
    required String token,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_device_id', deviceId);
    await prefs.setString('auth_token', token);
  }

  Future<AuthSession?> loadSession() async {
    final prefs = await SharedPreferences.getInstance();
    final deviceId = prefs.getString('auth_device_id');
    final token = prefs.getString('auth_token');
    if (deviceId == null || token == null) return null;
    return AuthSession(deviceId: deviceId, token: token);
  }

  Future<void> clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_device_id');
    await prefs.remove('auth_token');
  }
}
