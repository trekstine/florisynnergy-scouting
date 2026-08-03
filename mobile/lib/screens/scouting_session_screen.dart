import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import '../api_service.dart';
import '../auth_store.dart';
import '../models.dart';
import '../scouting_store.dart';
import '../widgets/severity_slider.dart';
import 'scouting_entry_form.dart';

const _uuid = Uuid();

/// The working screen for a greenhouse visit: a running list of everything
/// captured so far ("track and save them locally and show them to the
/// user"), a big button to add the next observation, and one "Submit all"
/// that pushes the whole batch at once. Nothing here talks to the network
/// until the scout explicitly submits — the queue is the source of truth.
class ScoutingSessionScreen extends StatefulWidget {
  const ScoutingSessionScreen({super.key, required this.greenhouse, required this.session});

  final Greenhouse greenhouse;
  final AuthSession session;

  @override
  State<ScoutingSessionScreen> createState() => _ScoutingSessionScreenState();
}

class _ScoutingSessionScreenState extends State<ScoutingSessionScreen> {
  final _queueStore = ScoutingQueueStore();
  late final ApiService _api;

  List<QueuedScoutingEntry> _entries = [];
  List<String> _bedSuggestions = [];
  ScoutingType? _lastUsedType;
  String? _lastUsedBed;
  bool _submitting = false;
  String? _submitStatus;

  @override
  void initState() {
    super.initState();
    _api = ApiService(baseUrl: widget.session.baseUrl);
    _loadQueue();
    _loadBedSuggestions();
  }

  Future<void> _loadQueue() async {
    final entries = await _queueStore.forGreenhouse(widget.greenhouse.id);
    if (!mounted) return;
    setState(() => _entries = entries);
  }

  Future<void> _loadBedSuggestions() async {
    try {
      final beds = await _api.fetchBeds(widget.session.token, widget.greenhouse.id);
      if (!mounted) return;
      setState(() => _bedSuggestions = beds.map((b) => b.code).toList());
    } catch (_) {
      // Not every block has beds pre-registered — free-text entry still works.
    }
  }

  Future<void> _addEntry() async {
    final result = await Navigator.of(context).push<QueuedScoutingEntry>(
      MaterialPageRoute(
        builder: (_) => ScoutingEntryForm(
          greenhouse: widget.greenhouse,
          bedSuggestions: _bedSuggestions,
          initialBedCode: _lastUsedBed,
          initialType: _lastUsedType,
        ),
      ),
    );
    if (result == null) return;
    await _queueStore.add(result);
    _lastUsedType = result.scoutingFor;
    _lastUsedBed = result.bedCode;
    await _loadQueue();
  }

  Future<void> _editEntry(QueuedScoutingEntry entry) async {
    final result = await Navigator.of(context).push<QueuedScoutingEntry>(
      MaterialPageRoute(
        builder: (_) => ScoutingEntryForm(
          greenhouse: widget.greenhouse,
          bedSuggestions: _bedSuggestions,
          editingEntry: entry,
        ),
      ),
    );
    if (result == null) return;
    await _queueStore.update(result);
    await _loadQueue();
  }

  Future<void> _deleteEntry(QueuedScoutingEntry entry) async {
    await _queueStore.remove(entry.clientRecordId);
    await _loadQueue();
  }

  Future<void> _submitAll() async {
    if (_entries.isEmpty || _submitting) return;
    setState(() {
      _submitting = true;
      _submitStatus = null;
    });

    try {
      // Upload any photos that haven't made it to the server yet. One
      // failure here just means that entry keeps its local image and
      // retries next time — it doesn't block the rest of the batch.
      final uploaded = <QueuedScoutingEntry>[];
      for (var entry in _entries) {
        if (entry.imageUrl == null && entry.localImagePath != null) {
          try {
            final url = await _api.uploadImage(
              token: widget.session.token,
              filePath: entry.localImagePath!,
            );
            entry = entry.copyWith(imageUrl: url);
            await _queueStore.update(entry);
          } catch (_) {
            // Keep the local path; the batch submit below still records the
            // observation, just without a photo this round.
          }
        }
        uploaded.add(entry);
      }

      final batchId = _uuid.v4();
      final payload = buildBatchPayload(batchId: batchId, entries: uploaded);
      final result = await _api.submitScoutingBatch(
        token: widget.session.token,
        payload: payload,
      );

      final syncedIds = {...result.accepted, ...result.duplicates};
      await _queueStore.removeMany(syncedIds);
      await _loadQueue();

      if (!mounted) return;
      final recNote = result.recommendationsCreated > 0
          ? ' · ${result.recommendationsCreated} new recommendation${result.recommendationsCreated == 1 ? '' : 's'} raised'
          : '';
      setState(() {
        _submitStatus = '${result.accepted.length} submitted$recNote';
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Synced ${result.accepted.length} entries.$recNote')),
      );
    } catch (error) {
      if (!mounted) return;
      final offline = isOfflineError(error);
      setState(() {
        _submitStatus = offline
            ? 'No connection — entries stay queued. Try again when you have signal.'
            : 'Submit failed: $error';
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF2E7D32),
        foregroundColor: Colors.white,
        title: Text(widget.greenhouse.label),
      ),
      body: Column(
        children: [
          if (_submitStatus != null)
            Container(
              width: double.infinity,
              color: const Color(0xFFFFF3E0),
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
              child: Text(_submitStatus!, style: const TextStyle(color: Color(0xFF8A5300))),
            ),
          Expanded(
            child: _entries.isEmpty
                ? _EmptyQueueState(onAdd: _addEntry)
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 120),
                    itemCount: _entries.length,
                    separatorBuilder: (context, index) => const SizedBox(height: 12),
                    itemBuilder: (context, index) {
                      final entry = _entries[index];
                      return _QueuedEntryCard(
                        entry: entry,
                        onTap: () => _editEntry(entry),
                        onDelete: () => _deleteEntry(entry),
                      );
                    },
                  ),
          ),
        ],
      ),
      floatingActionButton: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (_entries.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: FloatingActionButton.extended(
                heroTag: 'submit',
                onPressed: _submitting ? null : _submitAll,
                backgroundColor: const Color(0xFF1B5E20),
                icon: _submitting
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                      )
                    : const Icon(Icons.cloud_upload_outlined),
                label: Text('Submit all (${_entries.length})'),
              ),
            ),
          FloatingActionButton.extended(
            heroTag: 'add',
            onPressed: _addEntry,
            backgroundColor: const Color(0xFF2E7D32),
            icon: const Icon(Icons.add),
            label: const Text('Add entry'),
          ),
        ],
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
    );
  }
}

class _EmptyQueueState extends StatelessWidget {
  const _EmptyQueueState({required this.onAdd});

  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.playlist_add_check_circle_outlined, size: 48, color: Color(0xFFA5C2A5)),
            const SizedBox(height: 16),
            const Text(
              'No observations yet',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            const Text(
              'Tap "Add entry" for every bed, disease, pest, lure, or sticky trap you check. '
              'Everything stays on your device until you submit.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Color(0xFF6D7D6E)),
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: onAdd,
              style: FilledButton.styleFrom(backgroundColor: const Color(0xFF2E7D32)),
              icon: const Icon(Icons.add),
              label: const Text('Add first entry'),
            ),
          ],
        ),
      ),
    );
  }
}

class _QueuedEntryCard extends StatelessWidget {
  const _QueuedEntryCard({required this.entry, required this.onTap, required this.onDelete});

  final QueuedScoutingEntry entry;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final synced = entry.imageUrl != null || entry.localImagePath == null;
    return Dismissible(
      key: ValueKey(entry.clientRecordId),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        decoration: BoxDecoration(color: const Color(0xFFFFCDD2), borderRadius: BorderRadius.circular(20)),
        child: const Icon(Icons.delete_outline, color: Color(0xFFB71C1C)),
      ),
      onDismissed: (_) => onDelete(),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: const Color(0xFFE3E9E0)),
            boxShadow: const [
              BoxShadow(color: Color(0x10000000), blurRadius: 10, offset: Offset(0, 5)),
            ],
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: kSeverityScale[entry.severity].withOpacity(0.5),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(entry.scoutingFor.icon, color: const Color(0xFF2E4A2C)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(entry.targetLabel, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                    const SizedBox(height: 4),
                    Text(
                      'Bed ${entry.bedCode} · ${entry.varietyLabel ?? 'No variety'}',
                      style: const TextStyle(color: Color(0xFF6D7D6E)),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      children: [
                        _chip('${entry.scoutingFor.label} · ${kSeverityLabels[entry.severity]}'),
                        if (entry.countValue > 0) _chip('Count ${entry.countValue}'),
                        if (!synced) _chip('Photo pending upload'),
                      ],
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: Color(0xFF9E9E9E)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _chip(String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(color: const Color(0xFFF3F5EE), borderRadius: BorderRadius.circular(999)),
      child: Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF4F5B50))),
    );
  }
}
