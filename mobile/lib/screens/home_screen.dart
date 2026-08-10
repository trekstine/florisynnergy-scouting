import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import '../api_service.dart';
import '../auth_store.dart';
import '../models.dart';
import '../reference_cache.dart';
import '../scouting_store.dart';
import '../theme.dart';
import '../widgets/form_widgets.dart';
import 'greenhouse_picker_screen.dart';
import 'login_screen.dart';
import 'scouting_detail_screen.dart';

/// Main shell, ported from Bloom's MainScreen: purple app bar with the
/// current tab's title and an account button, an IndexedStack of tabs, a
/// flat bottom nav with an animated top indicator line, and a "New Report"
/// FAB on the Scouting tab.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _selectedIndex = 0;

  AuthSession? _session;
  List<QueuedScoutingEntry> _queue = [];
  List<ScoutingRecordSummary> _recent = [];
  bool _loading = true;

  static const _tabLabels = ['Home', 'Scouting', 'Spray', 'Reports'];
  static const _tabIcons = [
    Icons.home_outlined,
    Icons.biotech_outlined,
    Icons.science_outlined,
    Icons.analytics_outlined,
  ];
  static const _tabIconsActive = [
    Icons.home_rounded,
    Icons.biotech,
    Icons.science,
    Icons.analytics,
  ];

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final session = await AuthSessionStore().loadSession();
    if (session == null) {
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const ScoutLoginScreen()),
        (route) => false,
      );
      return;
    }
    setState(() => _session = session);
    await _refresh();
  }

  Future<void> _refresh() async {
    final session = _session;
    if (session == null) return;
    setState(() => _loading = true);
    final api = ApiService(baseUrl: session.baseUrl);
    try {
      await ReferenceCache.instance.ensureLoaded(api, session.token);
    } catch (_) {
      // Render with whatever's cached; picker surfaces a clearer error.
    }
    final queue = await ScoutingQueueStore().all();
    List<ScoutingRecordSummary> recent = [];
    try {
      recent = await api.fetchRecentScouting(session.token, limit: 30);
    } catch (_) {
      // Offline — recent stays empty, not fatal.
    }
    if (!mounted) return;
    setState(() {
      _queue = queue;
      _recent = recent;
      _loading = false;
    });
  }

  Future<void> _startSession() async {
    await Navigator.of(context, rootNavigator: true).push(
      MaterialPageRoute(builder: (_) => const GreenhousePickerScreen()),
    );
    await _refresh();
  }

  /// Opens the read-only detail view for a synced record. Shared by all
  /// three tabs that list records, so the session (needed to resolve photo
  /// URLs) is captured once here.
  void _openRecord(ScoutingRecordSummary record) {
    final session = _session;
    if (session == null) return;
    Navigator.of(context, rootNavigator: true).push(
      MaterialPageRoute(
        builder: (_) =>
            ScoutingDetailScreen(record: record, session: session),
      ),
    );
  }

  void _showAccountSheet() {
    final session = _session;
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (sheetCtx) => Container(
        decoration: const BoxDecoration(
          color: kBackground,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: EdgeInsets.fromLTRB(
          20, 16, 20, MediaQuery.of(sheetCtx).padding.bottom + 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: kBorder,
                  borderRadius: BorderRadius.circular(100),
                ),
              ),
            ),
            const SizedBox(height: 18),
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: kPrimary.withOpacity(0.1),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.person_outline_rounded,
                      color: kPrimary),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(session?.name ?? 'Scout', style: kSubheading()),
                      const SizedBox(height: 2),
                      Text(
                        '${session?.role ?? ''} · ${session?.deviceId ?? ''}',
                        style: kCaption(),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            OutlinedButton.icon(
              onPressed: () async {
                Navigator.pop(sheetCtx);
                await AuthSessionStore().clearSession();
                if (!mounted) return;
                Navigator.of(context).pushAndRemoveUntil(
                  MaterialPageRoute(builder: (_) => const ScoutLoginScreen()),
                  (route) => false,
                );
              },
              icon: const Icon(Icons.logout, size: 18, color: kError),
              label: Text('Sign out', style: kLabel(color: kError)),
              style: OutlinedButton.styleFrom(
                side: BorderSide(color: kError.withOpacity(0.4)),
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      _HomeTab(
        session: _session,
        loading: _loading,
        greenhouseCount: ReferenceCache.instance.greenhouses.length,
        pendingCount: _queue.length,
        recent: _recent.take(4).toList(),
        onStartSession: _startSession,
        onRefresh: _refresh,
        onOpenRecord: _openRecord,
      ),
      _ScoutingTab(
        loading: _loading,
        queue: _queue,
        recent: _recent,
        onRefresh: _refresh,
        onOpenRecord: _openRecord,
      ),
      const _SprayTab(),
      _ReportsTab(
        loading: _loading,
        recent: _recent,
        onRefresh: _refresh,
        onOpenRecord: _openRecord,
      ),
    ];

    return Scaffold(
      backgroundColor: kBackground,
      appBar: AppBar(
        backgroundColor: kPrimary,
        foregroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        automaticallyImplyLeading: false,
        systemOverlayStyle: const SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: Brightness.light,
          statusBarBrightness: Brightness.dark,
        ),
        title: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Padding(
                padding: const EdgeInsets.all(6),
                child: Image.asset('assets/logo.png', fit: BoxFit.contain),
              ),
            ),
            const SizedBox(width: 12),
            Text(
              _tabLabels[_selectedIndex],
              style: kHeading(color: Colors.white),
            ),
          ],
        ),
        actions: [
          GestureDetector(
            onTap: _showAccountSheet,
            child: Container(
              margin: const EdgeInsets.only(right: 16),
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.15),
                shape: BoxShape.circle,
              ),
              child: const Center(
                child: Icon(Icons.person_outline_rounded,
                    size: 20, color: Colors.white),
              ),
            ),
          ),
        ],
      ),
      body: IndexedStack(index: _selectedIndex, children: pages),
      floatingActionButton: _selectedIndex == 1
          ? FloatingActionButton.extended(
              onPressed: _startSession,
              backgroundColor: kPrimary,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add),
              label: Text('New Report', style: kLabel(color: Colors.white)),
            )
          : null,
      bottomNavigationBar: _BottomNav(
        selectedIndex: _selectedIndex,
        labels: _tabLabels,
        icons: _tabIcons,
        activeIcons: _tabIconsActive,
        onTap: (i) {
          if (_selectedIndex != i) setState(() => _selectedIndex = i);
        },
      ),
    );
  }
}

// ─── Home tab ─────────────────────────────────────────────────────────────────

class _HomeTab extends StatelessWidget {
  const _HomeTab({
    required this.session,
    required this.loading,
    required this.greenhouseCount,
    required this.pendingCount,
    required this.recent,
    required this.onStartSession,
    required this.onRefresh,
    required this.onOpenRecord,
  });

  final AuthSession? session;
  final bool loading;
  final int greenhouseCount;
  final int pendingCount;
  final List<ScoutingRecordSummary> recent;
  final VoidCallback onStartSession;
  final Future<void> Function() onRefresh;
  final void Function(ScoutingRecordSummary) onOpenRecord;

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      color: kPrimary,
      strokeWidth: 1.5,
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
        children: [
          Text(
            session != null
                ? 'Welcome back, ${session!.name.split(' ').first}'
                : 'Welcome back',
            style: kDisplay(),
          ),
          const SizedBox(height: 6),
          Text(
            'Capture field observations and keep the portal in sync.',
            style: kBody(color: kTextSecondary),
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: _StatCard(
                  value: loading ? '—' : '$greenhouseCount',
                  label: 'Greenhouses',
                  icon: Icons.house_outlined,
                  color: kPrimary,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _StatCard(
                  value: loading ? '—' : '$pendingCount',
                  label: 'Pending sync',
                  icon: Icons.pending_actions_outlined,
                  color: pendingCount > 0 ? kWarning : kSuccess,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          // Primary action card
          GestureDetector(
            onTap: onStartSession,
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: kPrimary,
                borderRadius: BorderRadius.circular(kRadiusLg),
              ),
              child: Row(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(kRadiusMd),
                    ),
                    child: const Icon(Icons.add_circle_outline,
                        color: Colors.white),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('New scouting session',
                            style: kSubheading(color: Colors.white)),
                        const SizedBox(height: 2),
                        Text(
                          'Select a greenhouse to start recording',
                          style: kCaption(
                              color: Colors.white.withOpacity(0.75)),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right_rounded,
                      color: Colors.white),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          const SectionHeader(
              icon: Icons.history_outlined, label: 'Recent activity'),
          const SizedBox(height: 10),
          if (loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Center(
                child: CircularProgressIndicator(
                    color: kPrimary, strokeWidth: 1.5),
              ),
            )
          else if (recent.isEmpty)
            const _EmptyState(
              icon: Icons.document_scanner_outlined,
              title: 'No scouting reports yet',
              subtitle: 'Tap "New scouting session" to log your first entry',
            )
          else
            ...recent.map(
              (r) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _RecordCard(record: r, onTap: () => onOpenRecord(r)),
              ),
            ),
        ],
      ),
    );
  }
}

// ─── Scouting tab ─────────────────────────────────────────────────────────────

class _ScoutingTab extends StatelessWidget {
  const _ScoutingTab({
    required this.loading,
    required this.queue,
    required this.recent,
    required this.onRefresh,
    required this.onOpenRecord,
  });

  final bool loading;
  final List<QueuedScoutingEntry> queue;
  final List<ScoutingRecordSummary> recent;
  final Future<void> Function() onRefresh;
  final void Function(ScoutingRecordSummary) onOpenRecord;

  @override
  Widget build(BuildContext context) {
    if (loading && recent.isEmpty && queue.isEmpty) {
      return const Center(
        child: CircularProgressIndicator(color: kPrimary, strokeWidth: 1.5),
      );
    }

    final byGreenhouse = <String, int>{};
    for (final entry in queue) {
      byGreenhouse[entry.greenhouseLabel] =
          (byGreenhouse[entry.greenhouseLabel] ?? 0) + 1;
    }

    if (recent.isEmpty && queue.isEmpty) {
      return const _EmptyState(
        icon: Icons.document_scanner_outlined,
        title: 'No scouting reports yet',
        subtitle: 'Tap "New Report" to log your first entry',
      );
    }

    return RefreshIndicator(
      color: kPrimary,
      strokeWidth: 1.5,
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
        children: [
          if (byGreenhouse.isNotEmpty) ...[
            const SectionHeader(
              icon: Icons.pending_actions_outlined,
              label: 'Queued on this device',
              accentColor: kWarning,
            ),
            const SizedBox(height: 10),
            ...byGreenhouse.entries.map(
              (e) => Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: kWarning.withOpacity(0.06),
                  borderRadius: BorderRadius.circular(kRadiusMd),
                  border: Border.all(color: kWarning.withOpacity(0.25)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.layers_outlined,
                        size: 18, color: kWarning),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text('${e.key}', style: kLabel()),
                    ),
                    MiniChip(
                        label: '${e.value} pending', color: kWarning),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
          ],
          const SectionHeader(
              icon: Icons.cloud_done_outlined, label: 'Synced reports'),
          const SizedBox(height: 10),
          if (recent.isEmpty)
            const _EmptyState(
              icon: Icons.cloud_off,
              title: 'Nothing synced yet',
              subtitle: 'Submitted reports appear here and in the portal',
            )
          else
            ...recent.map(
              (r) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _RecordCard(record: r, onTap: () => onOpenRecord(r)),
              ),
            ),
        ],
      ),
    );
  }
}

// ─── Spray tab (placeholder) ──────────────────────────────────────────────────

class _SprayTab extends StatelessWidget {
  const _SprayTab();

  @override
  Widget build(BuildContext context) {
    return const _EmptyState(
      icon: Icons.science_outlined,
      title: 'Spray records coming soon',
      subtitle: 'Track applications and active spray tasks here',
    );
  }
}

// ─── Reports tab ──────────────────────────────────────────────────────────────

class _ReportsTab extends StatelessWidget {
  const _ReportsTab({
    required this.loading,
    required this.recent,
    required this.onRefresh,
    required this.onOpenRecord,
  });

  final bool loading;
  final List<ScoutingRecordSummary> recent;
  final Future<void> Function() onRefresh;
  final void Function(ScoutingRecordSummary) onOpenRecord;

  @override
  Widget build(BuildContext context) {
    if (loading && recent.isEmpty) {
      return const Center(
        child: CircularProgressIndicator(color: kPrimary, strokeWidth: 1.5),
      );
    }

    // Simple by-type summary of what's synced.
    final byType = <ScoutingType, int>{};
    for (final r in recent) {
      byType[r.scoutingFor] = (byType[r.scoutingFor] ?? 0) + 1;
    }

    return RefreshIndicator(
      color: kPrimary,
      strokeWidth: 1.5,
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          const SectionHeader(
              icon: Icons.pie_chart_outline, label: 'Your recent breakdown'),
          const SizedBox(height: 10),
          Row(
            children: ScoutingType.values.map((t) {
              final count = byType[t] ?? 0;
              return Expanded(
                child: Container(
                  margin: EdgeInsets.only(
                      right: t == ScoutingType.values.last ? 0 : 8),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    color: t.color.withOpacity(0.06),
                    borderRadius: BorderRadius.circular(kRadiusMd),
                    border: Border.all(color: t.color.withOpacity(0.2)),
                  ),
                  child: Column(
                    children: [
                      Icon(t.icon, size: 18, color: t.color),
                      const SizedBox(height: 6),
                      Text(
                        '$count',
                        style: GoogleFonts.nunito(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: t.color,
                        ),
                      ),
                      Text(
                        t.label,
                        textAlign: TextAlign.center,
                        style: GoogleFonts.nunito(
                          fontSize: 9,
                          fontWeight: FontWeight.w600,
                          color: kTextSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 20),
          const SectionHeader(
              icon: Icons.analytics_outlined, label: 'All synced reports'),
          const SizedBox(height: 10),
          if (recent.isEmpty)
            const _EmptyState(
              icon: Icons.analytics_outlined,
              title: 'No reports yet',
              subtitle:
                  'Full trends, heatmaps, and matrices live in the web portal',
            )
          else
            ...recent.map(
              (r) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _RecordCard(record: r, onTap: () => onOpenRecord(r)),
              ),
            ),
        ],
      ),
    );
  }
}

// ─── Stat card ────────────────────────────────────────────────────────────────

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.value,
    required this.label,
    required this.icon,
    required this.color,
  });

  final String value;
  final String label;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: kBackground,
        borderRadius: BorderRadius.circular(kRadiusLg),
        border: Border.all(color: kBorder),
      ),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(kRadiusMd),
            ),
            child: Icon(icon, size: 19, color: color),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  value,
                  style: GoogleFonts.nunito(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: kTextPrimary,
                  ),
                ),
                Text(label, style: kCaption()),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Record card (Bloom's scouting list card) ─────────────────────────────────

class _RecordCard extends StatelessWidget {
  const _RecordCard({required this.record, this.onTap});

  final ScoutingRecordSummary record;
  final VoidCallback? onTap;

  String get _primaryLabel {
    final cache = ReferenceCache.instance;
    if (record.diseaseId != null) {
      for (final d in cache.diseases) {
        if (d.id == record.diseaseId) return d.name;
      }
    }
    if (record.pestId != null) {
      for (final p in cache.pests) {
        if (p.id == record.pestId) return p.name;
      }
    }
    return record.scoutingFor.label;
  }

  String get _greenhouseLabel {
    if (record.greenhouseId == null) return '';
    for (final g in ReferenceCache.instance.greenhouses) {
      if (g.id == record.greenhouseId) return g.label;
    }
    return 'GH ${record.greenhouseId}';
  }

  @override
  Widget build(BuildContext context) {
    final type = record.scoutingFor;
    final sevColor = severityColor(record.severity);
    final date = record.recordedAt.toLocal();
    final dateStr =
        '${_month(date.month)} ${date.day}';

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(kRadiusLg),
      child: Container(
      decoration: BoxDecoration(
        color: kBackground,
        borderRadius: BorderRadius.circular(kRadiusLg),
        border: Border.all(color: kBorder),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: type.color.withOpacity(0.1),
                borderRadius: BorderRadius.circular(kRadiusMd),
              ),
              child: Icon(type.icon, size: 20, color: type.color),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          _primaryLabel,
                          style: kLabel(),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(dateStr, style: kCaption()),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text(
                    [
                      if (_greenhouseLabel.isNotEmpty) _greenhouseLabel,
                      if (record.varietyCode != null) record.varietyCode!,
                    ].join('  ·  '),
                    style: kCaption(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: [
                      if (record.bedCode != null)
                        MiniChip(
                            label: 'Bed ${record.bedCode}',
                            color: kTextSecondary),
                      if (record.severity > 0)
                        MiniChip(
                          label: '$_primaryLabel ${record.severity}/5',
                          color: sevColor,
                        ),
                      if (record.flagged)
                        const MiniChip(label: 'Flagged', color: kError),
                    ],
                  ),
                  if ((record.notes ?? '').isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(
                      record.notes!,
                      style: kCaption(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(left: 8, top: 2),
              child: Column(
                children: [
                  if (record.severity > 0)
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: sevColor,
                        shape: BoxShape.circle,
                      ),
                    ),
                  const SizedBox(height: 8),
                  const Icon(
                    Icons.chevron_right_rounded,
                    size: 18,
                    color: kTextSecondary,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      ),
    );
  }

  static String _month(int m) => const [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      ][m - 1];
}

// ─── Empty state ──────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: kSurface,
                borderRadius: BorderRadius.circular(kRadiusLg),
                border: Border.all(color: kBorder),
              ),
              child: Icon(icon, size: 28, color: kTextSecondary),
            ),
            const SizedBox(height: 16),
            Text(title, style: kSubheading()),
            const SizedBox(height: 6),
            Text(
              subtitle,
              textAlign: TextAlign.center,
              style: kBody(color: kTextSecondary),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Flat bottom nav (Bloom's, with the animated top indicator) ───────────────

class _BottomNav extends StatelessWidget {
  const _BottomNav({
    required this.selectedIndex,
    required this.labels,
    required this.icons,
    required this.activeIcons,
    required this.onTap,
  });

  final int selectedIndex;
  final List<String> labels;
  final List<IconData> icons;
  final List<IconData> activeIcons;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: kBackground,
        border: Border(top: BorderSide(color: kBorder, width: 1)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 64,
          child: Row(
            children: List.generate(labels.length, (i) {
              final active = i == selectedIndex;
              return Expanded(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => onTap(i),
                  child: Column(
                    mainAxisSize: MainAxisSize.max,
                    mainAxisAlignment: MainAxisAlignment.start,
                    children: [
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        height: 4,
                        width: active ? 48.0 : 0.0,
                        decoration: const BoxDecoration(
                          color: kPrimary,
                          borderRadius: BorderRadius.vertical(
                            bottom: Radius.circular(100),
                          ),
                        ),
                      ),
                      const Spacer(),
                      Icon(
                        active ? activeIcons[i] : icons[i],
                        size: 22,
                        color: active ? kPrimary : kTextSecondary,
                      ),
                      const SizedBox(height: 3),
                      Text(
                        labels[i],
                        style: GoogleFonts.nunito(
                          fontSize: 11,
                          fontWeight:
                              active ? FontWeight.w700 : FontWeight.w500,
                          color: active ? kPrimary : kTextSecondary,
                        ),
                      ),
                      const Spacer(),
                    ],
                  ),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}
