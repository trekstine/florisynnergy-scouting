import 'package:flutter/material.dart';

enum ScoutingType { disease, pest, lure, stickyTrap }

extension ScoutingTypeLabel on ScoutingType {
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

  IconData get icon {
    switch (this) {
      case ScoutingType.disease:
        return Icons.bug_report;
      case ScoutingType.pest:
        return Icons.bug_report_outlined;
      case ScoutingType.lure:
        return Icons.local_fire_department;
      case ScoutingType.stickyTrap:
        return Icons.bug_report;
    }
  }
}

class Greenhouse {
  const Greenhouse({
    required this.id,
    required this.name,
    required this.available,
  });

  final int id;
  final String name;
  final bool available;

  String get label => 'GH $id';
}

class ScoutingReportSummary {
  const ScoutingReportSummary({
    required this.title,
    required this.greenhouse,
    required this.bed,
    required this.status,
    required this.severity,
    required this.tag,
    required this.timestamp,
    required this.color,
  });

  final String title;
  final String greenhouse;
  final String bed;
  final String status;
  final int severity;
  final String tag;
  final String timestamp;
  final Color color;
}
