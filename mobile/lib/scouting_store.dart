import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'models.dart';

/// Persists the local queue of [QueuedScoutingEntry] records — the "enter
/// many, submit once" buffer a scout builds up while walking a greenhouse.
/// Backed by SharedPreferences so the queue survives the app being killed
/// (or the phone dying) between the greenhouse and a signal.
class ScoutingQueueStore {
  ScoutingQueueStore({this.prefs});

  final SharedPreferences? prefs;
  static const _key = 'scouting_queue_v2';

  Future<SharedPreferences> _storage() async => prefs ?? await SharedPreferences.getInstance();

  Future<void> add(QueuedScoutingEntry entry) async {
    final storage = await _storage();
    final entries = await _readAll(storage);
    entries.add(entry);
    await _writeAll(storage, entries);
  }

  Future<void> update(QueuedScoutingEntry entry) async {
    final storage = await _storage();
    final entries = await _readAll(storage);
    final index = entries.indexWhere((e) => e.clientRecordId == entry.clientRecordId);
    if (index == -1) {
      entries.add(entry);
    } else {
      entries[index] = entry;
    }
    await _writeAll(storage, entries);
  }

  Future<void> remove(String clientRecordId) async {
    final storage = await _storage();
    final entries = await _readAll(storage);
    entries.removeWhere((e) => e.clientRecordId == clientRecordId);
    await _writeAll(storage, entries);
  }

  Future<void> removeMany(Iterable<String> clientRecordIds) async {
    final storage = await _storage();
    final entries = await _readAll(storage);
    final ids = clientRecordIds.toSet();
    entries.removeWhere((e) => ids.contains(e.clientRecordId));
    await _writeAll(storage, entries);
  }

  Future<List<QueuedScoutingEntry>> all() async {
    final storage = await _storage();
    return _readAll(storage);
  }

  Future<List<QueuedScoutingEntry>> forGreenhouse(int greenhouseId) async {
    final entries = await all();
    return entries.where((e) => e.greenhouseId == greenhouseId).toList();
  }

  Future<void> clear() async {
    final storage = await _storage();
    await storage.remove(_key);
  }

  Future<List<QueuedScoutingEntry>> _readAll(SharedPreferences storage) async {
    final raw = storage.getString(_key);
    if (raw == null || raw.isEmpty) return [];
    final list = jsonDecode(raw) as List<dynamic>;
    return list
        .map((e) => QueuedScoutingEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> _writeAll(
    SharedPreferences storage,
    List<QueuedScoutingEntry> entries,
  ) async {
    final json = jsonEncode(entries.map((e) => e.toJson()).toList());
    await storage.setString(_key, json);
  }
}
