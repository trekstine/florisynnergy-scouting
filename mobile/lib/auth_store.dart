import 'package:shared_preferences/shared_preferences.dart';

class AuthSession {
  AuthSession({
    required this.deviceId,
    required this.token,
    required this.baseUrl,
    required this.employeeId,
    required this.name,
    required this.role,
  });

  final String deviceId;
  final String token;
  final String baseUrl;
  final int employeeId;
  final String name;
  final String role;
}

class AuthSessionStore {
  Future<void> saveSession({
    required String deviceId,
    required String token,
    required String baseUrl,
    required int employeeId,
    required String name,
    required String role,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_device_id', deviceId);
    await prefs.setString('auth_token', token);
    await prefs.setString('auth_base_url', baseUrl);
    await prefs.setInt('auth_employee_id', employeeId);
    await prefs.setString('auth_name', name);
    await prefs.setString('auth_role', role);
  }

  Future<AuthSession?> loadSession() async {
    final prefs = await SharedPreferences.getInstance();
    final deviceId = prefs.getString('auth_device_id');
    final token = prefs.getString('auth_token');
    final baseUrl = prefs.getString('auth_base_url');
    final employeeId = prefs.getInt('auth_employee_id');
    final name = prefs.getString('auth_name');
    final role = prefs.getString('auth_role');
    if (deviceId == null ||
        token == null ||
        baseUrl == null ||
        employeeId == null ||
        name == null ||
        role == null) {
      return null;
    }
    return AuthSession(
      deviceId: deviceId,
      token: token,
      baseUrl: baseUrl,
      employeeId: employeeId,
      name: name,
      role: role,
    );
  }

  Future<void> clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_device_id');
    await prefs.remove('auth_token');
    await prefs.remove('auth_base_url');
    await prefs.remove('auth_employee_id');
    await prefs.remove('auth_name');
    await prefs.remove('auth_role');
  }
}
