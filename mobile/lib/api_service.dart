import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import 'models.dart';

class ApiException implements Exception {
  ApiException(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Result of `POST /scouting/batch` — mirrors `BatchResult` in the backend's
/// schemas.py so the review screen can tell the scout exactly what happened:
/// how many entries landed, how many were already-synced duplicates (safe —
/// that's the idempotency key doing its job), and whether any of them tipped
/// a pest/disease over its economic threshold and raised a recommendation.
class BatchSubmitResult {
  BatchSubmitResult({
    required this.accepted,
    required this.duplicates,
    required this.rejected,
    required this.recommendationsCreated,
  });

  final List<String> accepted;
  final List<String> duplicates;
  final Map<String, String> rejected;
  final int recommendationsCreated;

  factory BatchSubmitResult.fromJson(Map<String, dynamic> json) {
    return BatchSubmitResult(
      accepted: List<String>.from(json['accepted'] as List? ?? const []),
      duplicates: List<String>.from(json['duplicates'] as List? ?? const []),
      rejected: Map<String, String>.from(json['rejected'] as Map? ?? const {}),
      recommendationsCreated: json['recommendations_created'] as int? ?? 0,
    );
  }
}

class LoginResult {
  LoginResult({
    required this.token,
    required this.employeeId,
    required this.name,
    required this.role,
  });

  final String token;
  final int employeeId;
  final String name;
  final String role;
}

/// Builds the exact `/scouting/batch` request body from queued entries.
/// Field names here must match `ScoutingEntry` in the backend's schemas.py
/// byte-for-byte — this is the single seam between what the scout captures
/// on-device and what the portal (and analytics/recommendations) sees.
Map<String, dynamic> buildBatchPayload({
  required String batchId,
  required List<QueuedScoutingEntry> entries,
}) {
  return {
    'batch_id': batchId,
    'entries': entries
        .map(
          (e) => {
            'client_record_id': e.clientRecordId,
            'greenhouse_id': e.greenhouseId,
            'bed_code': e.bedCode,
            'scouting_for': e.scoutingFor.apiValue,
            'variety_id': e.varietyId,
            'variety_code': e.varietyCode,
            'pest_id': e.pestId,
            'disease_id': e.diseaseId,
            'lure_id': e.lureId,
            // No separate sticky-trap ID field in the flow — traps are
            // identified by bed/bay, same as everything else.
            'sticky_trap_id': null,
            'stage': e.stage,
            'location_on_plant': e.locationOnPlant,
            'severity': e.severity,
            'fcm_count': e.fcmCount,
            'sticky_trap_bug_count': e.stickyTrapBugCount,
            'lure_bug_count': e.lureBugCount,
            'beneficials_count': e.beneficialsCount,
            'notes': e.notes,
            'image_url': e.imageUrl,
            'gps_lat': e.gpsLat,
            'gps_lng': e.gpsLng,
            'verification_method': e.verificationMethod,
            'recorded_at': e.createdAt.toUtc().toIso8601String(),
          },
        )
        .toList(),
  };
}

class ApiService {
  ApiService({String? baseUrl})
    : _baseUrl = (baseUrl == null || baseUrl.isEmpty)
          ? 'http://192.168.1.10:8000'
          : baseUrl;

  final String _baseUrl;
  static const _timeout = Duration(seconds: 12);

  Uri _uri(String path) => Uri.parse('$_baseUrl/api/v1$path');

  Map<String, String> _headers(String token) => {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer $token',
  };

  Future<String> healthCheck() async {
    final response = await http
        .get(Uri.parse('$_baseUrl/health'))
        .timeout(const Duration(seconds: 6));
    if (response.statusCode != 200) {
      throw ApiException('Backend not reachable: ${response.statusCode}');
    }
    return response.body;
  }

  Future<LoginResult> login(String deviceId, String pin) async {
    final response = await http
        .post(
          _uri('/auth/login'),
          headers: const {'Content-Type': 'application/json'},
          body: jsonEncode({'device_identifier': deviceId, 'pin': pin}),
        )
        .timeout(_timeout);

    if (response.statusCode != 200) {
      throw ApiException(_readError(response, fallback: 'Login failed'));
    }
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return LoginResult(
      token: body['access_token'] as String,
      employeeId: body['employee_id'] as int,
      name: body['name'] as String,
      role: body['role'] as String,
    );
  }

  Future<List<Greenhouse>> fetchGreenhouses(String token) async {
    final rows = await _getList(token, '/greenhouses');
    return rows.map(Greenhouse.fromJson).toList();
  }

  Future<List<Bed>> fetchBeds(String token, int greenhouseId) async {
    final rows = await _getList(token, '/greenhouses/$greenhouseId/beds');
    return rows.map(Bed.fromJson).toList();
  }

  Future<List<Variety>> fetchVarieties(String token) async {
    final rows = await _getList(token, '/varieties');
    return rows.map(Variety.fromJson).toList();
  }

  Future<List<Pest>> fetchPests(String token) async {
    final rows = await _getList(token, '/pests');
    return rows.map(Pest.fromJson).toList();
  }

  Future<List<Disease>> fetchDiseases(String token) async {
    final rows = await _getList(token, '/diseases');
    return rows.map(Disease.fromJson).toList();
  }

  Future<List<ScoutingRecordSummary>> fetchRecentScouting(
    String token, {
    int limit = 30,
  }) async {
    final rows = await _getList(token, '/scouting?limit=$limit');
    return rows.map(ScoutingRecordSummary.fromJson).toList();
  }

  Future<List<Map<String, dynamic>>> _getList(String token, String path) async {
    final response = await http
        .get(_uri(path), headers: _headers(token))
        .timeout(_timeout);
    if (response.statusCode != 200) {
      throw ApiException(_readError(response, fallback: 'Request failed'));
    }
    final decoded = jsonDecode(response.body) as List<dynamic>;
    return decoded.cast<Map<String, dynamic>>();
  }

  /// Uploads a photo captured for a queued entry and returns the relative
  /// `/media/...` URL the backend hands back (see `routers/media.py`).
  Future<String> uploadImage({
    required String token,
    required String filePath,
  }) async {
    final request = http.MultipartRequest('POST', _uri('/media/upload'))
      ..headers['Authorization'] = 'Bearer $token'
      ..files.add(await http.MultipartFile.fromPath('file', filePath));

    final streamed = await request.send().timeout(const Duration(seconds: 30));
    final response = await http.Response.fromStream(streamed);
    if (response.statusCode != 201) {
      throw ApiException(_readError(response, fallback: 'Photo upload failed'));
    }
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return body['url'] as String;
  }

  Future<BatchSubmitResult> submitScoutingBatch({
    required String token,
    required Map<String, dynamic> payload,
  }) async {
    final response = await http
        .post(_uri('/scouting/batch'), headers: _headers(token), body: jsonEncode(payload))
        .timeout(const Duration(seconds: 20));

    if (response.statusCode != 200) {
      throw ApiException(_readError(response, fallback: 'Submit failed'));
    }
    return BatchSubmitResult.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }

  String _readError(http.Response response, {required String fallback}) {
    try {
      final body = jsonDecode(response.body);
      if (body is Map && body['detail'] != null) {
        return body['detail'].toString();
      }
    } catch (_) {
      // fall through to the generic message below
    }
    return '$fallback (${response.statusCode})';
  }
}

/// True when [error] looks like a connectivity problem (no signal in the
/// greenhouse, backend unreachable) rather than a real rejection from the
/// server — used to decide whether a failed submit should stay queued for
/// retry or be surfaced as a hard error.
bool isOfflineError(Object error) {
  return error is SocketException ||
      error is HttpException ||
      error.toString().contains('TimeoutException') ||
      error.toString().contains('Connection') ||
      error.toString().contains('Backend not reachable');
}
