import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiException implements Exception {
  ApiException(this.message);
  final String message;

  @override
  String toString() => message;
}

Map<String, dynamic> buildScoutingPayload({
  required int greenhouseId,
  required String bedCode,
  required String scoutingFor,
  required int severity,
  required String notes,
  String? varietyCode,
  String? stage,
  String? locationOnPlant,
  int fcmCount = 0,
  int stickyTrapBugCount = 0,
  int lureBugCount = 0,
  int beneficialsCount = 0,
  String? imageUrl,
  required DateTime recordedAt,
  required String clientRecordId,
}) {
  return {
    'batch_id': 'mobile-${DateTime.now().toUtc().toIso8601String()}',
    'entries': [
      {
        'client_record_id': clientRecordId,
        'greenhouse_id': greenhouseId,
        'bed_code': bedCode,
        'scouting_for': scoutingFor,
        'variety_code': varietyCode,
        'stage': stage,
        'location_on_plant': locationOnPlant,
        'severity': severity,
        'fcm_count': fcmCount,
        'sticky_trap_bug_count': stickyTrapBugCount,
        'lure_bug_count': lureBugCount,
        'beneficials_count': beneficialsCount,
        'notes': notes,
        'image_url': imageUrl,
        'verification_method': 'gps',
        'recorded_at': recordedAt.toUtc().toIso8601String(),
      },
    ],
  };
}

class ApiService {
  ApiService({String? baseUrl})
    : _baseUrl = baseUrl ?? 'http://192.168.1.10:8000';

  final String _baseUrl;

  Future<String> login(String deviceId, String pin) async {
    final uri = Uri.parse('$_baseUrl/api/v1/auth/login');
    final response = await http
        .post(
          uri,
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({'device_identifier': deviceId, 'pin': pin}),
        )
        .timeout(const Duration(seconds: 8));

    if (response.statusCode != 200) {
      throw ApiException('Login failed: ${response.body}');
    }

    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return body['access_token'] as String;
  }

  Future<String> healthCheck() async {
    final uri = Uri.parse('$_baseUrl/health');
    final response = await http.get(uri).timeout(const Duration(seconds: 5));
    if (response.statusCode != 200) {
      throw ApiException('Backend not reachable: ${response.statusCode}');
    }
    return response.body;
  }

  Future<void> submitScouting({
    required String token,
    required Map<String, dynamic> payload,
  }) async {
    final response = await http.post(
      Uri.parse('$_baseUrl/api/v1/scouting/batch'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      },
      body: jsonEncode(payload),
    );

    if (response.statusCode != 200) {
      throw ApiException('Submit failed: ${response.body}');
    }
  }
}
