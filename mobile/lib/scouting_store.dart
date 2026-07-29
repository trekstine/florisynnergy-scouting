import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class ScoutingDraft {
  ScoutingDraft({
    required this.id,
    required this.payload,
    required this.createdAt,
  });

  final String id;
  final Map<String, Object?> payload;
  final DateTime createdAt;

  Map<String, dynamic> toJson() => {
    'id': id,
    'payload': payload,
    'createdAt': createdAt.toUtc().toIso8601String(),
  };

  factory ScoutingDraft.fromJson(Map<String, dynamic> json) {
    return ScoutingDraft(
      id: json['id'] as String,
      payload: Map<String, Object?>.from(json['payload'] as Map),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}

class ScoutingDraftStore {
  ScoutingDraftStore({required this.prefs});

  final SharedPreferences? prefs;
  static const _key = 'scouting_drafts';
  static const _queueKey = 'scouting_queue';

  Future<void> clear() async {
    final storage = prefs ?? await SharedPreferences.getInstance();
    await storage.remove(_key);
  }

  Future<void> saveQueuedEntry(Map<String, Object?> entry) async {
    final storage = prefs ?? await SharedPreferences.getInstance();
    final queue = await loadQueuedEntriesInternal(storage);
    queue.add(entry);
    await storage.setString(_queueKey, jsonEncode(queue));
  }

  Future<List<Map<String, Object?>>> loadQueuedEntries() async {
    final storage = prefs ?? await SharedPreferences.getInstance();
    return loadQueuedEntriesInternal(storage);
  }

  Future<List<Map<String, Object?>>> loadQueuedEntriesInternal(
    SharedPreferences storage,
  ) async {
    final raw = storage.getString(_queueKey);
    if (raw == null || raw.isEmpty) return [];
    final list = jsonDecode(raw) as List<dynamic>;
    return list
        .map((e) => Map<String, Object?>.from(e as Map))
        .toList();
  }

  Future<void> clearQueuedEntries() async {
    final storage = prefs ?? await SharedPreferences.getInstance();
    await storage.remove(_queueKey);
  }

  Future<void> saveDraft(ScoutingDraft draft) async {
    final storage = prefs ?? await SharedPreferences.getInstance();
    final drafts = await loadDraftsInternal(storage);
    drafts.add(draft);
    final json = jsonEncode(drafts.map((e) => e.toJson()).toList());
    await storage.setString(_key, json);
  }

  Future<List<ScoutingDraft>> loadDrafts() async {
    final storage = prefs ?? await SharedPreferences.getInstance();
    return loadDraftsInternal(storage);
  }

  Future<List<ScoutingDraft>> loadDraftsInternal(
    SharedPreferences storage,
  ) async {
    final raw = storage.getString(_key);
    if (raw == null || raw.isEmpty) return [];
    final list = jsonDecode(raw) as List<dynamic>;
    return list
        .map((e) => ScoutingDraft.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
