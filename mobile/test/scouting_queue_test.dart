import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:florisynergy_scouting_mobile/scouting_store.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('queues and loads scouting entries', () async {
    SharedPreferences.setMockInitialValues({});
    final store = ScoutingDraftStore(prefs: null);

    await store.saveQueuedEntry({
      'client_record_id': 'entry-1',
      'bed_code': 'B12',
      'scouting_for': 'pest',
    });

    final queued = await store.loadQueuedEntries();
    expect(queued.length, 1);
    expect(queued.first['bed_code'], 'B12');

    await store.clearQueuedEntries();
    expect(await store.loadQueuedEntries(), isEmpty);
  });
}
