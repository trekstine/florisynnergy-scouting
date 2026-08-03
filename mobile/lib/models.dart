import 'package:flutter/material.dart';

/// The four capture modes the field flow supports. Each one drives a
/// different subset of fields on the entry form (see
/// `widgets/scouting_entry_form.dart`), mirroring how a scout actually works
/// a greenhouse: disease/pest walks are variety-and-severity led, lure and
/// sticky-trap checks are count led.
enum ScoutingType { disease, pest, lure, stickyTrap }

extension ScoutingTypeX on ScoutingType {
  /// The exact string the backend's `scouting_for` column expects.
  String get apiValue {
    switch (this) {
      case ScoutingType.disease:
        return 'disease';
      case ScoutingType.pest:
        return 'pest';
      case ScoutingType.lure:
        return 'lure';
      case ScoutingType.stickyTrap:
        return 'sticky_trap';
    }
  }

  String get label {
    switch (this) {
      case ScoutingType.disease:
        return 'Disease';
      case ScoutingType.pest:
        return 'Pest';
      case ScoutingType.lure:
        return 'Lure';
      case ScoutingType.stickyTrap:
        return 'Sticky Trap';
    }
  }

  String get description {
    switch (this) {
      case ScoutingType.disease:
        return 'Score disease pressure on a variety';
      case ScoutingType.pest:
        return 'Score pest pressure on a variety';
      case ScoutingType.lure:
        return 'Log a pheromone lure catch';
      case ScoutingType.stickyTrap:
        return 'Log a sticky trap catch';
    }
  }

  IconData get icon {
    switch (this) {
      case ScoutingType.disease:
        return Icons.coronavirus_outlined;
      case ScoutingType.pest:
        return Icons.bug_report_outlined;
      case ScoutingType.lure:
        return Icons.local_fire_department_outlined;
      case ScoutingType.stickyTrap:
        return Icons.grid_on_outlined;
    }
  }

  static ScoutingType fromApiValue(String value) {
    return ScoutingType.values.firstWhere(
      (t) => t.apiValue == value,
      orElse: () => ScoutingType.disease,
    );
  }
}

/// Growth stage options for lure / sticky-trap catches. Kept as a plain list
/// (rather than an enum) since supervisors may want to tweak the vocabulary
/// from the portal without a mobile app release.
const List<String> kLifecycleStages = [
  'Egg',
  'Larva',
  'Pupa',
  'Adult',
];

class Greenhouse {
  const Greenhouse({
    required this.id,
    required this.name,
    this.code,
    this.bedCount = 0,
  });

  final int id;
  final String name;
  final String? code;
  final int bedCount;

  String get label => code != null && code!.isNotEmpty ? code! : name;

  factory Greenhouse.fromJson(Map<String, dynamic> json) {
    return Greenhouse(
      id: json['id'] as int,
      name: json['name'] as String? ?? 'Greenhouse',
      code: json['code'] as String?,
      bedCount: json['bed_count'] as int? ?? 0,
    );
  }
}

class Bed {
  const Bed({required this.id, required this.greenhouseId, required this.code});

  final int id;
  final int greenhouseId;
  final String code;

  factory Bed.fromJson(Map<String, dynamic> json) {
    return Bed(
      id: json['id'] as int,
      greenhouseId: json['greenhouse_id'] as int,
      code: json['code'] as String,
    );
  }
}

class Variety {
  const Variety({
    required this.id,
    required this.code,
    required this.name,
    this.crop = 'rose',
    this.color,
  });

  final int id;
  final String code;
  final String name;
  final String crop;
  final String? color;

  String get label => '$name ($code)';

  factory Variety.fromJson(Map<String, dynamic> json) {
    return Variety(
      id: json['id'] as int,
      code: json['code'] as String,
      name: json['name'] as String,
      crop: json['crop'] as String? ?? 'rose',
      color: json['color'] as String?,
    );
  }
}

class Pest {
  const Pest({
    required this.id,
    required this.name,
    this.category,
    this.threshold = 3,
  });

  final int id;
  final String name;
  final String? category;
  final int threshold;

  factory Pest.fromJson(Map<String, dynamic> json) {
    return Pest(
      id: json['id'] as int,
      name: json['name'] as String,
      category: json['category'] as String?,
      threshold: json['threshold'] as int? ?? 3,
    );
  }
}

class Disease {
  const Disease({required this.id, required this.name, this.threshold = 3});

  final int id;
  final String name;
  final int threshold;

  factory Disease.fromJson(Map<String, dynamic> json) {
    return Disease(
      id: json['id'] as int,
      name: json['name'] as String,
      threshold: json['threshold'] as int? ?? 3,
    );
  }
}

/// A previously-synced record as returned by `GET /scouting`, used for the
/// recent-activity lists on the Home and Reports tabs.
class ScoutingRecordSummary {
  const ScoutingRecordSummary({
    required this.id,
    required this.scoutingFor,
    required this.severity,
    required this.recordedAt,
    this.greenhouseId,
    this.bedCode,
    this.varietyCode,
    this.pestId,
    this.diseaseId,
    this.notes,
    this.imageUrl,
    this.flagged = false,
  });

  final int id;
  final ScoutingType scoutingFor;
  final int severity;
  final DateTime recordedAt;
  final int? greenhouseId;
  final String? bedCode;
  final String? varietyCode;
  final int? pestId;
  final int? diseaseId;
  final String? notes;
  final String? imageUrl;
  final bool flagged;

  factory ScoutingRecordSummary.fromJson(Map<String, dynamic> json) {
    return ScoutingRecordSummary(
      id: json['id'] as int,
      scoutingFor: ScoutingTypeX.fromApiValue(json['scouting_for'] as String),
      severity: json['severity'] as int? ?? 0,
      recordedAt: DateTime.parse(json['recorded_at'] as String),
      greenhouseId: json['greenhouse_id'] as int?,
      bedCode: json['bed_code'] as String?,
      varietyCode: json['variety_code'] as String?,
      pestId: json['pest_id'] as int?,
      diseaseId: json['disease_id'] as int?,
      notes: json['notes'] as String?,
      imageUrl: json['image_url'] as String?,
      flagged: json['flagged'] as bool? ?? false,
    );
  }
}

/// A scouting observation captured on-device and waiting to be pushed to the
/// server. Everything the scout enters lives here first — the whole point of
/// the flow is that dozens of these can pile up locally, offline, before a
/// single batch submit. See `scouting_store.dart` for persistence and
/// `api_service.dart#buildBatchPayload` for how a list of these becomes the
/// `/scouting/batch` request body.
class QueuedScoutingEntry {
  QueuedScoutingEntry({
    required this.clientRecordId,
    required this.greenhouseId,
    required this.greenhouseLabel,
    required this.bedCode,
    required this.scoutingFor,
    required this.createdAt,
    this.varietyId,
    this.varietyCode,
    this.varietyLabel,
    this.pestId,
    this.pestLabel,
    this.diseaseId,
    this.diseaseLabel,
    this.lureId,
    this.stage,
    this.locationOnPlant,
    this.severity = 0,
    this.fcmCount = 0,
    this.stickyTrapBugCount = 0,
    this.lureBugCount = 0,
    this.beneficialsCount = 0,
    this.notes,
    this.localImagePath,
    this.imageUrl,
    this.gpsLat,
    this.gpsLng,
    this.verificationMethod = 'gps',
  });

  final String clientRecordId;
  final int greenhouseId;
  final String greenhouseLabel;
  final String bedCode;
  final ScoutingType scoutingFor;
  final DateTime createdAt;

  final int? varietyId;
  final String? varietyCode;
  final String? varietyLabel;
  final int? pestId;
  final String? pestLabel;
  final int? diseaseId;
  final String? diseaseLabel;
  final String? lureId;
  final String? stage;
  final String? locationOnPlant;
  final int severity;
  final int fcmCount;
  final int stickyTrapBugCount;
  final int lureBugCount;
  final int beneficialsCount;
  final String? notes;

  /// Path to the photo on-device before it's uploaded. Cleared once
  /// [imageUrl] is populated by a successful upload.
  final String? localImagePath;
  final String? imageUrl;
  final double? gpsLat;
  final double? gpsLng;
  final String verificationMethod;

  /// What to show as the headline target on the queue card — the disease,
  /// pest, or lure/trap identifier, whichever applies.
  String get targetLabel {
    switch (scoutingFor) {
      case ScoutingType.disease:
        return diseaseLabel ?? 'Disease';
      case ScoutingType.pest:
        return pestLabel ?? 'Pest';
      case ScoutingType.lure:
        return lureId != null && lureId!.isNotEmpty
            ? 'Lure $lureId · ${pestLabel ?? 'Unknown pest'}'
            : (pestLabel ?? 'Lure');
      case ScoutingType.stickyTrap:
        return pestLabel ?? 'Sticky trap';
    }
  }

  int get countValue {
    switch (scoutingFor) {
      case ScoutingType.lure:
        return lureBugCount;
      case ScoutingType.stickyTrap:
        return stickyTrapBugCount;
      case ScoutingType.disease:
      case ScoutingType.pest:
        return fcmCount;
    }
  }

  QueuedScoutingEntry copyWith({String? imageUrl, String? localImagePath}) {
    return QueuedScoutingEntry(
      clientRecordId: clientRecordId,
      greenhouseId: greenhouseId,
      greenhouseLabel: greenhouseLabel,
      bedCode: bedCode,
      scoutingFor: scoutingFor,
      createdAt: createdAt,
      varietyId: varietyId,
      varietyCode: varietyCode,
      varietyLabel: varietyLabel,
      pestId: pestId,
      pestLabel: pestLabel,
      diseaseId: diseaseId,
      diseaseLabel: diseaseLabel,
      lureId: lureId,
      stage: stage,
      locationOnPlant: locationOnPlant,
      severity: severity,
      fcmCount: fcmCount,
      stickyTrapBugCount: stickyTrapBugCount,
      lureBugCount: lureBugCount,
      beneficialsCount: beneficialsCount,
      notes: notes,
      localImagePath: localImagePath ?? this.localImagePath,
      imageUrl: imageUrl ?? this.imageUrl,
      gpsLat: gpsLat,
      gpsLng: gpsLng,
      verificationMethod: verificationMethod,
    );
  }

  Map<String, dynamic> toJson() => {
    'clientRecordId': clientRecordId,
    'greenhouseId': greenhouseId,
    'greenhouseLabel': greenhouseLabel,
    'bedCode': bedCode,
    'scoutingFor': scoutingFor.apiValue,
    'createdAt': createdAt.toUtc().toIso8601String(),
    'varietyId': varietyId,
    'varietyCode': varietyCode,
    'varietyLabel': varietyLabel,
    'pestId': pestId,
    'pestLabel': pestLabel,
    'diseaseId': diseaseId,
    'diseaseLabel': diseaseLabel,
    'lureId': lureId,
    'stage': stage,
    'locationOnPlant': locationOnPlant,
    'severity': severity,
    'fcmCount': fcmCount,
    'stickyTrapBugCount': stickyTrapBugCount,
    'lureBugCount': lureBugCount,
    'beneficialsCount': beneficialsCount,
    'notes': notes,
    'localImagePath': localImagePath,
    'imageUrl': imageUrl,
    'gpsLat': gpsLat,
    'gpsLng': gpsLng,
    'verificationMethod': verificationMethod,
  };

  factory QueuedScoutingEntry.fromJson(Map<String, dynamic> json) {
    return QueuedScoutingEntry(
      clientRecordId: json['clientRecordId'] as String,
      greenhouseId: json['greenhouseId'] as int,
      greenhouseLabel: json['greenhouseLabel'] as String? ?? '',
      bedCode: json['bedCode'] as String? ?? '',
      scoutingFor: ScoutingTypeX.fromApiValue(json['scoutingFor'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
      varietyId: json['varietyId'] as int?,
      varietyCode: json['varietyCode'] as String?,
      varietyLabel: json['varietyLabel'] as String?,
      pestId: json['pestId'] as int?,
      pestLabel: json['pestLabel'] as String?,
      diseaseId: json['diseaseId'] as int?,
      diseaseLabel: json['diseaseLabel'] as String?,
      lureId: json['lureId'] as String?,
      stage: json['stage'] as String?,
      locationOnPlant: json['locationOnPlant'] as String?,
      severity: json['severity'] as int? ?? 0,
      fcmCount: json['fcmCount'] as int? ?? 0,
      stickyTrapBugCount: json['stickyTrapBugCount'] as int? ?? 0,
      lureBugCount: json['lureBugCount'] as int? ?? 0,
      beneficialsCount: json['beneficialsCount'] as int? ?? 0,
      notes: json['notes'] as String?,
      localImagePath: json['localImagePath'] as String?,
      imageUrl: json['imageUrl'] as String?,
      gpsLat: (json['gpsLat'] as num?)?.toDouble(),
      gpsLng: (json['gpsLng'] as num?)?.toDouble(),
      verificationMethod: json['verificationMethod'] as String? ?? 'gps',
    );
  }
}
