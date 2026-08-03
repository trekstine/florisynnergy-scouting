import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import '../api_service.dart';
import '../auth_store.dart';
import '../models.dart';
import '../reference_cache.dart';
import '../scouting_store.dart';
import '../theme.dart';
import 'add_scouting_screen.dart';

/// Greenhouse selection, styled after Bloom's GreenhouseSelectionScreen:
/// a 3-column grid of flat tiles with the house icon and a status chip.
/// Tiles with locally-queued entries show an amber "n queued" chip so a
/// scout resuming a session can see where they left off.
class GreenhousePickerScreen extends StatefulWidget {
  const GreenhousePickerScreen({super.key});

  @override
  State<GreenhousePickerScreen> createState() => _GreenhousePickerScreenState();
}

class _GreenhousePickerScreenState extends State<GreenhousePickerScreen> {
  final _queueStore = ScoutingQueueStore();

  bool _loading = true;
  String? _error;
  AuthSession? _session;
  Map<int, int> _queuedCounts = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final session = await AuthSessionStore().loadSession();
      if (session == null) {
        throw ApiException('Session expired. Please sign in again.');
      }
      final api = ApiService(baseUrl: session.baseUrl);
      await ReferenceCache.instance.ensureLoaded(api, session.token);

      final queue = await _queueStore.all();
      final counts = <int, int>{};
      for (final entry in queue) {
        counts[entry.greenhouseId] = (counts[entry.greenhouseId] ?? 0) + 1;
      }

      if (!mounted) return;
      setState(() {
        _session = session;
        _queuedCounts = counts;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString();
        _loading = false;
      });
    }
  }

  Future<void> _open(Greenhouse gh) async {
    HapticFeedback.selectionClick();
    await Navigator.of(context, rootNavigator: true).push(
      MaterialPageRoute(
        builder: (_) => AddScoutingScreen(greenhouse: gh, session: _session!),
      ),
    );
    // Refresh queued badges when returning from a session.
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final greenhouses = ReferenceCache.instance.greenhouses;

    return Scaffold(
      backgroundColor: kSurface,
      appBar: AppBar(
        backgroundColor: kBackground,
        foregroundColor: kTextPrimary,
        elevation: 0,
        scrolledUnderElevation: .5,
        title: Text('Select Greenhouse', style: kSubheading()),
      ),
      body: _loading
          ? const Center(
              child: CircularProgressIndicator(color: kPrimary, strokeWidth: 1.5),
            )
          : _error != null
              ? _ErrorState(message: _error!, onRetry: _load)
              : RefreshIndicator(
                  color: kPrimary,
                  strokeWidth: 1.5,
                  onRefresh: _load,
                  child: greenhouses.isEmpty
                      ? ListView(
                          children: [
                            const SizedBox(height: 120),
                            Center(
                              child: Text(
                                'No greenhouses found.',
                                style: kBody(color: kTextSecondary),
                              ),
                            ),
                          ],
                        )
                      : GridView.builder(
                          padding: const EdgeInsets.all(16),
                          gridDelegate:
                              const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 3,
                            mainAxisSpacing: 12,
                            crossAxisSpacing: 12,
                            childAspectRatio: 1.1,
                          ),
                          itemCount: greenhouses.length,
                          itemBuilder: (context, index) {
                            final gh = greenhouses[index];
                            return _GreenhouseTile(
                              greenhouse: gh,
                              queuedCount: _queuedCounts[gh.id] ?? 0,
                              onTap: () => _open(gh),
                            );
                          },
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
    final hasQueue = queuedCount > 0;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        decoration: BoxDecoration(
          color: hasQueue ? kPrimary.withOpacity(0.08) : kBackground,
          borderRadius: BorderRadius.circular(kRadiusLg),
          border: Border.all(
            color: hasQueue ? kPrimary.withOpacity(0.4) : kBorder,
            width: hasQueue ? 1.5 : 1,
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.house_outlined,
              size: 28,
              color: hasQueue ? kPrimary : kTextSecondary,
            ),
            const SizedBox(height: 6),
            Text(
              greenhouse.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.nunito(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: hasQueue ? kPrimary : kTextPrimary,
              ),
            ),
            const SizedBox(height: 2),
            if (hasQueue)
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: kWarning.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(100),
                ),
                child: Text(
                  '$queuedCount queued',
                  style: GoogleFonts.nunito(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    color: kWarning,
                  ),
                ),
              )
            else
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: kSuccess.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(100),
                ),
                child: Text(
                  '${greenhouse.bedCount} beds',
                  style: GoogleFonts.nunito(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    color: kSuccess,
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
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: kSurface,
                borderRadius: BorderRadius.circular(kRadiusLg),
                border: Border.all(color: kBorder),
              ),
              child:
                  const Icon(Icons.cloud_off, size: 28, color: kTextSecondary),
            ),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center, style: kBody()),
            const SizedBox(height: 16),
            SizedBox(
              width: 140,
              child: ElevatedButton(
                onPressed: onRetry,
                child: const Text('Retry'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
