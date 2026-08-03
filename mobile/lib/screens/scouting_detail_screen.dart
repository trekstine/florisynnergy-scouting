import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../auth_store.dart';
import '../models.dart';
import '../reference_cache.dart';
import '../theme.dart';
import '../widgets/form_widgets.dart';

/// Read-only detail view for a synced scouting record — opened by tapping a
/// record card on Home / Scouting / Reports. Shows every captured field,
/// grouped the same way the capture form collects them, plus the photo and
/// the session comment covering the whole submission.
class ScoutingDetailScreen extends StatelessWidget {
  const ScoutingDetailScreen({
    super.key,
    required this.record,
    required this.session,
  });

  final ScoutingRecordSummary record;
  final AuthSession session;

  String get _targetLabel {
    final cache = ReferenceCache.instance;
    if (record.diseaseId != null) {
      for (final d in cache.diseases) {
        if (d.id == record.diseaseId) return d.name;
      }
      return 'Disease';
    }
    if (record.pestId != null) {
      for (final p in cache.pests) {
        if (p.id == record.pestId) return p.name;
      }
      return 'Pest';
    }
    return record.scoutingFor.label;
  }

  String get _greenhouseLabel {
    if (record.greenhouseId == null) return '—';
    for (final g in ReferenceCache.instance.greenhouses) {
      if (g.id == record.greenhouseId) return g.label;
    }
    return 'GH ${record.greenhouseId}';
  }

  String get _varietyLabel {
    final code = record.varietyCode;
    if (code == null || code.isEmpty) return '—';
    for (final v in ReferenceCache.instance.varieties) {
      if (v.code == code) return '${v.name} ($code)';
    }
    return code;
  }

  /// Photos come back as a relative `/media/...` path; prefix the backend
  /// base URL from the session so the image resolves.
  String? get _imageUrl {
    final url = record.imageUrl;
    if (url == null || url.isEmpty) return null;
    if (url.startsWith('http')) return url;
    final base = session.baseUrl.endsWith('/')
        ? session.baseUrl.substring(0, session.baseUrl.length - 1)
        : session.baseUrl;
    return '$base$url';
  }

  bool get _isCountType =>
      record.scoutingFor == ScoutingType.lure ||
      record.scoutingFor == ScoutingType.stickyTrap;

  @override
  Widget build(BuildContext context) {
    final accent = record.scoutingFor.color;
    final date = record.recordedAt.toLocal();
    final photo = _imageUrl;

    return Scaffold(
      backgroundColor: kSurface,
      appBar: AppBar(
        backgroundColor: kBackground,
        foregroundColor: kTextPrimary,
        elevation: 0,
        scrolledUnderElevation: .5,
        titleSpacing: 0,
        title: Text('Scouting Report', style: kSubheading()),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          // ── Header card: what was found, how bad ──
          Container(
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: kBackground,
              borderRadius: BorderRadius.circular(kRadiusLg),
              border: Border.all(color: kBorder),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(height: 3, color: accent),
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      Container(
                        width: 46,
                        height: 46,
                        decoration: BoxDecoration(
                          color: accent.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(kRadiusMd),
                        ),
                        child: Icon(record.scoutingFor.icon,
                            size: 23, color: accent),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(_targetLabel, style: kHeading()),
                            const SizedBox(height: 3),
                            Text(
                              record.scoutingFor.label,
                              style: kCaption(color: accent),
                            ),
                          ],
                        ),
                      ),
                      if (_isCountType)
                        _BigValue(
                          value: '${record.totalCount}',
                          caption: 'caught',
                          color: accent,
                        )
                      else
                        _BigValue(
                          value: '${record.severity}/5',
                          caption: 'severity',
                          color: severityColor(record.severity),
                        ),
                    ],
                  ),
                ),
                if (record.flagged)
                  Container(
                    width: double.infinity,
                    color: kError.withOpacity(0.06),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 10),
                    child: Row(
                      children: [
                        const Icon(Icons.flag_outlined,
                            size: 15, color: kError),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            record.flagReason ?? 'Flagged for review',
                            style: kCaption(color: kError),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          // ── Location ──
          const SectionHeader(
              icon: Icons.location_on_outlined, label: 'Location'),
          const SizedBox(height: 10),
          FormCard(
            children: [
              _Row(label: 'Greenhouse', value: _greenhouseLabel),
              _Row(label: 'Bed / Bay', value: record.bedCode ?? '—'),
              _Row(label: 'Variety', value: _varietyLabel),
              _Row(
                label: 'Verification',
                value: _verificationLabel(record.verificationMethod),
                trailing: record.gpsLat != null
                    ? Icon(Icons.gps_fixed, size: 14, color: kSuccess)
                    : Icon(Icons.gps_off,
                        size: 14, color: kTextSecondary.withOpacity(0.5)),
              ),
              if (record.gpsLat != null && record.gpsLng != null)
                _Row(
                  label: 'Coordinates',
                  value:
                      '${record.gpsLat!.toStringAsFixed(5)}, ${record.gpsLng!.toStringAsFixed(5)}',
                ),
            ],
          ),

          const SizedBox(height: 20),

          // ── Observation ──
          SectionHeader(
            icon: record.scoutingFor.icon,
            label: 'Observation',
            accentColor: accent,
          ),
          const SizedBox(height: 10),
          FormCard(
            accentColor: accent,
            children: [
              _Row(label: 'Type', value: record.scoutingFor.label),
              _Row(
                label: record.diseaseId != null ? 'Disease' : 'Pest',
                value: _targetLabel,
              ),
              if ((record.stage ?? '').isNotEmpty)
                _Row(label: 'Stage', value: record.stage!),
              if ((record.locationOnPlant ?? '').isNotEmpty)
                _Row(label: 'Where on plant', value: record.locationOnPlant!),
              _Row(
                label: 'Severity score',
                value: '${record.severity} / 5',
                valueColor: severityColor(record.severity),
              ),
              if (record.lureBugCount > 0)
                _Row(label: 'Lure catch', value: '${record.lureBugCount}'),
              if (record.stickyTrapBugCount > 0)
                _Row(
                    label: 'Sticky trap catch',
                    value: '${record.stickyTrapBugCount}'),
              if (record.fcmCount > 0)
                _Row(label: 'FCM count', value: '${record.fcmCount}'),
              if (record.beneficialsCount > 0)
                _Row(
                    label: 'Beneficials',
                    value: '${record.beneficialsCount}',
                    valueColor: kSuccess),
              _Row(
                label: 'Recorded',
                value: '${_formatDate(date)} · ${_formatTime(date)}',
              ),
            ],
          ),

          // ── Photo ──
          if (photo != null) ...[
            const SizedBox(height: 20),
            const SectionHeader(
                icon: Icons.photo_camera_outlined, label: 'Field photo'),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(kRadiusLg),
              child: Image.network(
                photo,
                width: double.infinity,
                fit: BoxFit.cover,
                loadingBuilder: (context, child, progress) {
                  if (progress == null) return child;
                  return Container(
                    height: 200,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: kBackground,
                      border: Border.all(color: kBorder),
                      borderRadius: BorderRadius.circular(kRadiusLg),
                    ),
                    child: const CircularProgressIndicator(
                        color: kPrimary, strokeWidth: 1.5),
                  );
                },
                errorBuilder: (context, error, stack) => Container(
                  height: 140,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: kBackground,
                    border: Border.all(color: kBorder),
                    borderRadius: BorderRadius.circular(kRadiusLg),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.broken_image_outlined,
                          color: kTextSecondary),
                      const SizedBox(height: 8),
                      Text('Photo unavailable offline', style: kCaption()),
                    ],
                  ),
                ),
              ),
            ),
          ],

          // ── Notes + session comment ──
          if ((record.notes ?? '').isNotEmpty ||
              (record.sessionComment ?? '').isNotEmpty) ...[
            const SizedBox(height: 20),
            const SectionHeader(
                icon: Icons.notes_outlined, label: 'Notes & comments'),
            const SizedBox(height: 10),
            FormCard(
              children: [
                if ((record.notes ?? '').isNotEmpty)
                  _Block(label: 'Entry notes', value: record.notes!),
                if ((record.sessionComment ?? '').isNotEmpty)
                  _Block(
                    label: 'Overall session comment',
                    value: record.sessionComment!,
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  static String _verificationLabel(String v) {
    switch (v) {
      case 'gps':
        return 'GPS verified';
      case 'qr_code':
        return 'QR code';
      case 'pin_bypass':
        return 'PIN bypass';
      default:
        return 'Manual';
    }
  }

  static String _formatDate(DateTime d) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return '${d.day} ${months[d.month - 1]} ${d.year}';
  }

  static String _formatTime(DateTime d) =>
      '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}

class _BigValue extends StatelessWidget {
  const _BigValue({
    required this.value,
    required this.caption,
    required this.color,
  });

  final String value;
  final String caption;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(kRadiusMd),
      ),
      child: Column(
        children: [
          Text(
            value,
            style: GoogleFonts.nunito(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
          Text(
            caption,
            style: GoogleFonts.nunito(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

/// Single label → value row inside a [FormCard].
class _Row extends StatelessWidget {
  const _Row({
    required this.label,
    required this.value,
    this.valueColor,
    this.trailing,
  });

  final String label;
  final String value;
  final Color? valueColor;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 130,
            child: Text(label, style: kLabel(color: kTextSecondary)),
          ),
          Expanded(
            child: Text(
              value,
              style: kBody(color: valueColor ?? kTextPrimary),
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 6), trailing!],
        ],
      ),
    );
  }
}

/// Multi-line block (notes) inside a [FormCard].
class _Block extends StatelessWidget {
  const _Block({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: kLabel(color: kTextSecondary)),
          const SizedBox(height: 6),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(11),
            decoration: BoxDecoration(
              color: kSurface,
              borderRadius: BorderRadius.circular(kRadius),
              border: Border.all(color: kBorder),
            ),
            child: Text(value, style: kBody()),
          ),
        ],
      ),
    );
  }
}
