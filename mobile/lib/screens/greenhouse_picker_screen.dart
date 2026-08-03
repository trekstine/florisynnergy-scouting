import 'package:flutter/material.dart';

import '../api_service.dart';
import '../auth_store.dart';
import '../models.dart';
import '../reference_cache.dart';
import '../scouting_store.dart';
import 'scouting_session_screen.dart';

/// Step one of the field flow: "select a greenhouse — can be a dropdown."
/// We use a searchable grid instead of a literal dropdown since a farm can
/// run a few dozen blocks and a scout usually knows the block by sight/number
/// faster than by scrolling a menu. Each tile also shows how many entries are
/// already queued locally for that block, so a scout resuming a session can
/// see at a glance where they left off.
class GreenhousePickerScreen extends StatefulWidget {
  const GreenhousePickerScreen({super.key});

  @override
  State<GreenhousePickerScreen> createState() => _GreenhousePickerScreenState();
}

class _GreenhousePickerScreenState extends State<GreenhousePickerScreen> {
  final _queueStore = ScoutingQueueStore();
  final _searchController = TextEditingController();

  bool _loading = true;
  String? _error;
  AuthSession? _session;
  Map<int, int> _queuedCounts = {};
  String _query = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final session = await AuthSessionStore().loadSession();
      if (session == null) {
        throw Exception('Session expired. Please sign in again.');
      }
      final api = ApiService(baseUrl: session.baseUrl);
      await ReferenceCache.instance.ensureLoaded(api, session.token);

      final queue = await _queueStore.all();
      final counts = <int, int>{};
      for (final entry in queue) {
        counts[entry.greenhouseId] = (counts[entry.greenhouseId] ?? 0) + 1;
      }

      setState(() {
        _session = session;
        _queuedCounts = counts;
        _loading = false;
      });
    } catch (error) {
      setState(() {
        _error = error.toString();
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final greenhouses = ReferenceCache.instance.greenhouses
        .where((g) => g.label.toLowerCase().contains(_query.toLowerCase()))
        .toList();

    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF2E7D32),
        foregroundColor: Colors.white,
        title: const Text('Select greenhouse'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _ErrorState(message: _error!, onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                    children: [
                      TextField(
                        controller: _searchController,
                        onChanged: (v) => setState(() => _query = v),
                        decoration: InputDecoration(
                          hintText: 'Search greenhouse name or code',
                          prefixIcon: const Icon(Icons.search),
                          filled: true,
                          fillColor: const Color(0xFFF3F5EE),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(16),
                            borderSide: BorderSide.none,
                          ),
                        ),
                      ),
                      const SizedBox(height: 18),
                      if (greenhouses.isEmpty)
                        const Padding(
                          padding: EdgeInsets.only(top: 40),
                          child: Center(child: Text('No greenhouses found.')),
                        )
                      else
                        GridView.builder(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          itemCount: greenhouses.length,
                          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 2,
                            mainAxisSpacing: 14,
                            crossAxisSpacing: 14,
                            childAspectRatio: 1.15,
                          ),
                          itemBuilder: (context, index) {
                            final gh = greenhouses[index];
                            return _GreenhouseTile(
                              greenhouse: gh,
                              queuedCount: _queuedCounts[gh.id] ?? 0,
                              onTap: () => _openSession(gh),
                            );
                          },
                        ),
                    ],
                  ),
                ),
    );
  }

  void _openSession(Greenhouse greenhouse) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ScoutingSessionScreen(
          greenhouse: greenhouse,
          session: _session!,
        ),
      ),
    );
  }
}

class _GreenhouseTile extends StatelessWidget {
  const _GreenhouseTile({
    required this.greenhouse,
    required this.queuedCount,
    required this.onTap,
  });

  final Greenhouse greenhouse;
  final int queuedCount;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: const Color(0xFFE3E9E0)),
          boxShadow: const [
            BoxShadow(color: Color(0x12000000), blurRadius: 12, offset: Offset(0, 6)),
          ],
        ),
        padding: const EdgeInsets.all(16),
        child: Stack(
          children: [
            Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFE8F5E9),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(Icons.home_work_outlined, color: Color(0xFF2E7D32), size: 26),
                ),
                const SizedBox(height: 12),
                Text(
                  greenhouse.label,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                ),
                const SizedBox(height: 4),
                Text(
                  '${greenhouse.bedCount} beds mapped',
                  style: const TextStyle(color: Color(0xFF8A9A88), fontSize: 12),
                ),
              ],
            ),
            if (queuedCount > 0)
              Positioned(
                top: 0,
                right: 0,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEF6C00),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '$queuedCount pending',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off, size: 40, color: Color(0xFF9E9E9E)),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}
