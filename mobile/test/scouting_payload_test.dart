import 'package:flutter_test/flutter_test.dart';
import 'package:florisynergy_scouting_mobile/api_service.dart';

void main() {
  test('buildScoutingPayload includes the required scouting fields', () {
    final payload = buildScoutingPayload(
      greenhouseId: 3,
      bedCode: 'B12',
      scoutingFor: 'pest',
      severity: 4,
      notes: 'Check thrips',
      varietyCode: 'R1',
      stage: 'adult',
      locationOnPlant: 'upper_leaf',
      fcmCount: 6,
      stickyTrapBugCount: 2,
      lureBugCount: 1,
      beneficialsCount: 4,
      imageUrl: 'https://cdn.example.com/photo.jpg',
      recordedAt: DateTime.utc(2026, 7, 27, 8, 30),
      clientRecordId: 'abc-123',
    );

    final entries = payload['entries'] as List<dynamic>;
    final entry = entries.first as Map<String, dynamic>;

    expect(entry['greenhouse_id'], 3);
    expect(entry['bed_code'], 'B12');
    expect(entry['scouting_for'], 'pest');
    expect(entry['severity'], 4);
    expect(entry['notes'], 'Check thrips');
    expect(entry['variety_code'], 'R1');
    expect(entry['stage'], 'adult');
    expect(entry['location_on_plant'], 'upper_leaf');
    expect(entry['fcm_count'], 6);
    expect(entry['sticky_trap_bug_count'], 2);
    expect(entry['lure_bug_count'], 1);
    expect(entry['beneficials_count'], 4);
    expect(entry['image_url'], 'https://cdn.example.com/photo.jpg');
    expect(entry['client_record_id'], 'abc-123');
    expect(entry['recorded_at'], '2026-07-27T08:30:00.000Z');
  });
}
