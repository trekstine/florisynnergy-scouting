import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'api_service.dart';
import 'models.dart';

/// Caches greenhouses, varieties, pests, and diseases on-device so the
/// scouting form's dropdowns keep working the moment a scout walks into a
/// greenhouse with no signal — reference data barely changes day to day, so
/// "last synced at login" is fresh enough. Backed by SharedPreferences so it
/// also survives an app restart, not just a dead network mid-session.
class ReferenceCache {
  ReferenceCache._();
  static final ReferenceCache instance = ReferenceCache._();

  List<Greenhouse> greenhouses = [];
  List<Variety> varieties = [];
  List<Pest> pests = [];
  List<Disease> diseases = [];
  DateTime? syncedAt;

  static const _key = 'reference_cache_v1';

  bool get hasData => greenhouses.isNotEmpty;

  /// Pulls fresh reference data from the API and persists it. Throws on
  /// failure — callers should catch this and fall back to [loadFromDisk] so
  /// a scout who's offline at login can still work from yesterday's data.
  Future<void> refresh(ApiService api, String token) async {
    final results = await Future.wait([
      api.fetchGreenhouses(token),
      api.fetchVarieties(token),
      api.fetchPests(token),
      api.fetchDiseases(token),
    ]);
    greenhouses = results[0] as List<Greenhouse>;
    varieties = results[1] as List<Variety>;
    pests = results[2] as List<Pest>;
    diseases = results[3] as List<Disease>;
    syncedAt = DateTime.now();
    await _persist();
  }

  Future<void> _persist() async {
    final prefs = await SharedPreferences.getInstance();
    final payload = {
      'syncedAt': syncedAt?.toIso8601String(),
      'greenhouses': greenhouses
          .map((g) => {'id': g.id, 'name': g.name, 'code': g.code, 'bed_count': g.bedCount})
          .toList(),
      'varieties': varieties
          .map((v) => {
                'id': v.id,
                'code': v.code,
                'name': v.name,
                'crop': v.crop,
                'color': v.color,
              })
          .toList(),
      'pests': pests
          .map((p) => {
                'id': p.id,
                'name': p.name,
                'category': p.category,
                'threshold': p.threshold,
              })
          .toList(),
      'diseases': diseases
          .map((d) => {'id': d.id, 'name': d.name, 'threshold': d.threshold})
          .toList(),
    };
    await prefs.setString(_key, jsonEncode(payload));
  }

  /// Loads whatever was last synced from disk. Returns `false` if nothing
  /// has ever been cached (first-ever login with no connectivity).
  Future<bool> loadFromDisk() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null) return false;
    final decoded = jsonDecode(raw) as Map<String, dynamic>;
    greenhouses = (decoded['greenhouses'] as List)
        .map((e) => Greenhouse.fromJson(e as Map<String, dynamic>))
        .toList();
    varieties = (decoded['varieties'] as List)
        .map((e) => Variety.fromJson(e as Map<String, dynamic>))
        .toList();
    pests = (decoded['pests'] as List)
        .map((e) => Pest.fromJson(e as Map<String, dynamic>))
        .toList();
    diseases = (decoded['diseases'] as List)
        .map((e) => Disease.fromJson(e as Map<String, dynamic>))
        .toList();
    final syncedAtRaw = decoded['syncedAt'] as String?;
    syncedAt = syncedAtRaw != null ? DateTime.tryParse(syncedAtRaw) : null;
    return greenhouses.isNotEmpty;
  }

  /// Best-effort load: try the network first, fall back to disk, and only
  /// throw if neither has anything — used right after login and whenever the
  /// greenhouse picker is opened.
  Future<void> ensureLoaded(ApiService api, String token) async {
    try {
      await refresh(api, token);
      return;
    } catch (_) {
      // Offline or backend hiccup — fall through to cached data.
      if (!hasData) {
        final loaded = await loadFromDisk();
        if (!loaded) rethrow;
      }
    }
  }
}
