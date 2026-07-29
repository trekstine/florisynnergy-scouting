import 'package:flutter_test/flutter_test.dart';
import 'package:florisynergy_scouting_mobile/scouting_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  SharedPreferences.setMockInitialValues({});

  test('drafts can be stored and loaded as a queue', () async {
    final store = ScoutingDraftStore(prefs: null);
    await store.clear();

    await store.saveDraft(
      ScoutingDraft(
        id: 'draft-1',
        payload: {'bed_code': 'B12', 'scouting_for': 'pest'},
        createdAt: DateTime.utc(2026, 7, 27, 8, 0),
      ),
    );

    final drafts = await store.loadDrafts();
    expect(drafts.length, 1);
    expect(drafts.first.payload['bed_code'], 'B12');
  });
}
