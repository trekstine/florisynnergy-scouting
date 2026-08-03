import 'package:flutter/material.dart';

import '../api_service.dart';
import '../auth_store.dart';
import '../models.dart';
import '../reference_cache.dart';
import '../scouting_store.dart';
import '../widgets/severity_slider.dart';
import 'greenhouse_picker_screen.dart';
import 'login_screen.dart';

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
      // Home still renders with whatever's cached; the picker screen
      // surfaces a clearer error if there's truly nothing to work with.
    }
    final queue = await ScoutingQueueStore().all();
    List<ScoutingRecordSummary> recent = [];
    try {
      recent = await api.fetchRecentScouting(session.token, limit: 20);
    } catch (_) {
      // Offline — recent activity just stays empty, not fatal.
    }
    if (!mounted) return;
    setState(() {
      _queue = queue;
      _recent = recent;
      _loading = false;
    });
  }

  Future<void> _startSession() async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const GreenhousePickerScreen()),
    );
    await _refresh();
  }

  Future<void> _signOut() async {
    await AuthSessionStore().clearSession();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const ScoutLoginScreen()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final greenhouseCount = ReferenceCache.instance.greenhouses.length;

    final screens = [
      _HomeOverviewScreen(
        session: _session,
        loading: _loading,
        greenhouseCount: greenhouseCount,
        pendingCount: _queue.length,
        recent: _recent.take(5).toList(),
        onStartSession: _startSession,
        onSignOut: _signOut,
      ),
      _ScoutingOverviewScreen(
        loading: _loading,
        queue: _queue,
        recent: _recent,
        onStartSession: _startSession,
        onRefresh: _refresh,
      ),
      const _SprayScreen(),
      _ReportsScreen(loading: _loading, recent: _recent, onRefresh: _refresh),
    ];

    return Scaffold(
      body: SafeArea(child: screens[_selectedIndex]),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _selectedIndex,
        onTap: (index) => setState(() => _selectedIndex = index),
        selectedItemColor: const Color(0xFF2E7D32),
        unselectedItemColor: Colors.grey.shade600,
        type: BottomNavigationBarType.fixed,
        showUnselectedLabels: true,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.home_outlined), label: 'Home'),
          BottomNavigationBarItem(icon: Icon(Icons.agriculture_outlined), label: 'Scouting'),
          BottomNavigationBarItem(icon: Icon(Icons.water_drop_outlined), label: 'Spray'),
          BottomNavigationBarItem(icon: Icon(Icons.bar_chart_outlined), label: 'Reports'),
        ],
      ),
    );
  }
}

class _HomeOverviewScreen extends StatelessWidget {
  const _HomeOverviewScreen({
    required this.session,
    required this.loading,
    required this.greenhouseCount,
    required this.pendingCount,
    required this.recent,
    required this.onStartSession,
    required this.onSignOut,
  });

  final AuthSession? session;
  final bool loading;
  final int greenhouseCount;
  final int pendingCount;
  final List<ScoutingRecordSummary> recent;
  final VoidCallback onStartSession;
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      session != null ? 'Hi, ${session!.name.split(' ').first}' : 'FloriSynergy Scouting',
                      style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'A single place to capture field observations and keep the portal in sync.',
                      style: TextStyle(fontSize: 15, color: Color(0xFF5A6A58)),
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: onSignOut,
                icon: const Icon(Icons.logout, color: Color(0xFF6D7D6E)),
                tooltip: 'Sign out',
              ),
            ],
          ),
          const SizedBox(height: 22),
          Row(
            children: [
              _MetricCard(value: loading ? '—' : '$greenhouseCount', label: 'Greenhouses'),
              const SizedBox(width: 12),
              _MetricCard(
                value: loading ? '—' : '$pendingCount',
                label: 'Pending sync',
                accent: pendingCount > 0,
              ),
            ],
          ),
          const SizedBox(height: 18),
          _ActionCard(
            title: 'Start a new scouting session',
            subtitle: 'Pick a greenhouse, log disease, pest, lure, or sticky-trap observations.',
            icon: Icons.add_circle_outline,
            onTap: onStartSession,
          ),
          const SizedBox(height: 22),
          const Text('Recent activity', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          if (loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (recent.isEmpty)
            const _InfoCard(
              title: 'Nothing synced yet',
              message: 'Once you submit a scouting session it will show up here — and instantly in the web portal.',
            )
          else
            ...recent.map(
              (r) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _ActivityTile(record: r),
              ),
            ),
          const SizedBox(height: 6),
          const _InfoCard(
            title: 'Tip',
            message: 'Entries queue on your device until you tap "Submit all" — capture as many as you like offline.',
          ),
        ],
      ),
    );
  }
}

class _ScoutingOverviewScreen extends StatelessWidget {
  const _ScoutingOverviewScreen({
    required this.loading,
    required this.queue,
    required this.recent,
    required this.onStartSession,
    required this.onRefresh,
  });

  final bool loading;
  final List<QueuedScoutingEntry> queue;
  final List<ScoutingRecordSummary> recent;
  final VoidCallback onStartSession;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final byGreenhouse = <String, List<QueuedScoutingEntry>>{};
    for (final entry in queue) {
      byGreenhouse.putIfAbsent(entry.greenhouseLabel, () => []).add(entry);
    }

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 100),
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Scouting', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
              FilledButton.icon(
                onPressed: onStartSession,
                style: FilledButton.styleFrom(backgroundColor: const Color(0xFF2E7D32)),
                icon: const Icon(Icons.add, size: 18),
                label: const Text('New session'),
              ),
            ],
          ),
          const SizedBox(height: 18),
          if (byGreenhouse.isNotEmpty) ...[
            const Text('Queued locally', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
            const SizedBox(height: 10),
            ...byGreenhouse.entries.map(
              (e) => Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF3E0),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.pending_actions, color: Color(0xFFEF6C00)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text('${e.key} · ${e.value.length} entr${e.value.length == 1 ? 'y' : 'ies'} not yet submitted'),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
          ],
          const Text('Recently synced', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          const SizedBox(height: 10),
          if (loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (recent.isEmpty)
            const _InfoCard(title: 'No records yet', message: 'Submitted observations will appear here.')
          else
            ...recent.map(
              (r) => Padding(padding: const EdgeInsets.only(bottom: 10), child: _ActivityTile(record: r)),
            ),
        ],
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.value, required this.label, this.accent = false});

  final String value;
  final String label;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    final color = accent ? const Color(0xFFB25E00) : const Color(0xFF2E7D32);
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 16),
        decoration: BoxDecoration(
          color: accent ? const Color(0xFFFFF3E0) : const Color(0xFFE8F5E9),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value, style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: color)),
            const SizedBox(height: 6),
            Text(label, style: TextStyle(color: color.withOpacity(0.85))),
          ],
        ),
      ),
    );
  }
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({required this.title, required this.subtitle, required this.icon, required this.onTap});

  final String title;
  final String subtitle;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(24),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          boxShadow: const [BoxShadow(color: Color(0x12000000), blurRadius: 16, offset: Offset(0, 8))],
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: const Color(0xFFE8F5E9), borderRadius: BorderRadius.circular(16)),
              child: Icon(icon, color: const Color(0xFF2E7D32), size: 26),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                  const SizedBox(height: 6),
                  Text(subtitle, style: const TextStyle(color: Color(0xFF5A6A58))),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: Color(0xFF9E9E9E)),
          ],
        ),
      ),
    );
  }
}

class _ActivityTile extends StatelessWidget {
  const _ActivityTile({required this.record});

  final ScoutingRecordSummary record;

  @override
  Widget build(BuildContext context) {
    final color = kSeverityScale[record.severity.clamp(0, 5).toInt()];
    final subtitleParts = [
      if (record.bedCode != null) 'Bed ${record.bedCode}',
      '${record.severity}/5',
    ];
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [BoxShadow(color: Color(0x0F000000), blurRadius: 12, offset: Offset(0, 6))],
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(14)),
            child: Icon(record.scoutingFor.icon, color: const Color(0xFF2E4A2C)),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(record.scoutingFor.label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                const SizedBox(height: 4),
                Text(subtitleParts.join(' · '), style: const TextStyle(color: Color(0xFF6D6D6D))),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.title, required this.message});

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(color: const Color(0xFFF3F5EE), borderRadius: BorderRadius.circular(20)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
          const SizedBox(height: 8),
          Text(message, style: const TextStyle(color: Color(0xFF5A6A58))),
        ],
      ),
    );
  }
}

class _SprayScreen extends StatelessWidget {
  const _SprayScreen();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: 24),
        child: Text(
          'Spray planning is coming soon. Use this tab to manage applications and track active spray tasks.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 17, color: Color(0xFF54675A)),
        ),
      ),
    );
  }
}

class _ReportsScreen extends StatelessWidget {
  const _ReportsScreen({required this.loading, required this.recent, required this.onRefresh});

  final bool loading;
  final List<ScoutingRecordSummary> recent;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 100),
        children: [
          const Text('Reports', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          const Text(
            'Recent field observations. For trends, heatmaps, and pest matrices, open the web portal.',
            style: TextStyle(color: Color(0xFF5A6A58)),
          ),
          const SizedBox(height: 18),
          if (loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (recent.isEmpty)
            const _InfoCard(title: 'No records yet', message: 'Submit a scouting session to see it here.')
          else
            ...recent.map(
              (r) => Padding(padding: const EdgeInsets.only(bottom: 10), child: _ActivityTile(record: r)),
            ),
        ],
      ),
    );
  }
}
