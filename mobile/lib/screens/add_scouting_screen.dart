import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:uuid/uuid.dart';

import '../api_service.dart';
import '../auth_store.dart';
import '../models.dart';
import '../reference_cache.dart';
import '../scouting_store.dart';
import '../theme.dart';
import '../widgets/form_widgets.dart';

const _uuid = Uuid();

/// The capture flow, ported screen-for-screen from the Bloom app's
/// AddScoutingReportScreen: sticky greenhouse + bed context, a four-pill
/// type selector that reshapes the details card (with the type's accent
/// color), "Add to Queue" in a fixed bottom bar, an animated queue badge in
/// the app bar, and a bottom-sheet queue with swipe-to-remove and a single
/// green "Submit All". Differences from Bloom are backend-driven only:
/// reference data comes from the FloriSynergy API (cached offline), the
/// queue persists on-device between app launches, and submits go to
/// `/scouting/batch` with per-entry idempotency keys.
class AddScoutingScreen extends StatefulWidget {
  const AddScoutingScreen({
    super.key,
    required this.greenhouse,
    required this.session,
  });

  final Greenhouse greenhouse;
  final AuthSession session;

  @override
  State<AddScoutingScreen> createState() => _AddScoutingScreenState();
}

class _AddScoutingScreenState extends State<AddScoutingScreen>
    with SingleTickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  final _queueStore = ScoutingQueueStore();
  late final ApiService _api;

  // ── Sticky context (persists between entries) ──
  final _bedCtrl = TextEditingController();
  List<String> _bedSuggestions = [];

  // ── Per-entry fields ──
  ScoutingType _scoutingType = ScoutingType.disease;
  Disease? _selectedDisease;
  Pest? _selectedPest;
  final _lureIdCtrl = TextEditingController();
  String? _selectedStage;
  String? _selectedLocation;
  Variety? _selectedVariety;
  int _score = 1;
  int _bugCount = 0;
  final _notesCtrl = TextEditingController();

  // ── Photo (per entry) ──
  File? _pickedImage;

  // ── GPS (best-effort, captured in the background) ──
  double? _gpsLat;
  double? _gpsLng;

  // ── Queue ──
  List<QueuedScoutingEntry> _queue = [];
  bool _submitting = false;
  bool _processing = false; // uploading the photo while adding to queue

  late AnimationController _queueBadgeCtrl;
  late Animation<double> _queueBadgeAnim;

  @override
  void initState() {
    super.initState();
    _api = ApiService(baseUrl: widget.session.baseUrl);
    _queueBadgeCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
    );
    _queueBadgeAnim = Tween<double>(begin: 1.0, end: 1.3).animate(
      CurvedAnimation(parent: _queueBadgeCtrl, curve: Curves.elasticOut),
    );
    _loadQueue();
    _loadBeds();
    _captureLocation();
  }

  @override
  void dispose() {
    _bedCtrl.dispose();
    _lureIdCtrl.dispose();
    _notesCtrl.dispose();
    _queueBadgeCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadQueue() async {
    final entries = await _queueStore.forGreenhouse(widget.greenhouse.id);
    if (mounted) setState(() => _queue = entries);
  }

  Future<void> _loadBeds() async {
    try {
      final beds =
          await _api.fetchBeds(widget.session.token, widget.greenhouse.id);
      if (mounted) {
        setState(() => _bedSuggestions = beds.map((b) => b.code).toList());
      }
    } catch (_) {
      // Beds not registered for this block — free-text entry still works.
    }
  }

  Future<void> _captureLocation() async {
    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.always ||
          permission == LocationPermission.whileInUse) {
        final position = await Geolocator.getCurrentPosition(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
            timeLimit: Duration(seconds: 8),
          ),
        );
        if (mounted) {
          setState(() {
            _gpsLat = position.latitude;
            _gpsLng = position.longitude;
          });
        }
      }
    } catch (_) {
      // GPS is best-effort — never block the scout on a cold fix.
    }
  }

  void _resetEntryFields() {
    _selectedDisease = null;
    _selectedPest = null;
    _lureIdCtrl.clear();
    _selectedStage = null;
    _selectedLocation = null;
    _selectedVariety = null;
    _score = 1;
    _bugCount = 0;
    _notesCtrl.clear();
    _pickedImage = null;
  }

  // ── Photo handling ──────────────────────────────────────────────────────────

  Future<void> _pickImage(ImageSource source) async {
    try {
      final picked = await ImagePicker().pickImage(
        source: source,
        imageQuality: 70,
        maxWidth: 1600,
      );
      if (picked == null) return;
      setState(() => _pickedImage = File(picked.path));
      HapticFeedback.selectionClick();
    } catch (e) {
      if (mounted) showToast(context, 'Could not get image: $e', kError);
    }
  }

  void _removeImage() => setState(() => _pickedImage = null);

  // ── Queue operations ────────────────────────────────────────────────────────

  Future<void> _addToQueue() async {
    if (_processing) return;
    if (!(_formKey.currentState?.validate() ?? false)) return;

    // The variety field passes text validation as soon as something is
    // typed — but the entry needs an actual pick so the record carries the
    // variety id/code the portal joins on.
    if (_selectedVariety == null) {
      showToast(context, 'Pick a variety from the list', kWarning,
          bottomMargin: 80);
      return;
    }

    // Try uploading the photo now; if we're offline keep the local path and
    // the submit step will retry.
    String? imageUrl;
    String? localImagePath = _pickedImage?.path;
    if (_pickedImage != null) {
      setState(() => _processing = true);
      try {
        imageUrl = await _api.uploadImage(
          token: widget.session.token,
          filePath: _pickedImage!.path,
        );
        localImagePath = null;
      } catch (_) {
        // Offline — keep the local path for a retry at submit time.
      }
      if (mounted) setState(() => _processing = false);
    }

    final isCount = _scoutingType == ScoutingType.lure ||
        _scoutingType == ScoutingType.stickyTrap;

    final entry = QueuedScoutingEntry(
      clientRecordId: _uuid.v4(),
      greenhouseId: widget.greenhouse.id,
      greenhouseLabel: widget.greenhouse.label,
      bedCode: _bedCtrl.text.trim(),
      scoutingFor: _scoutingType,
      createdAt: DateTime.now(),
      varietyId: _selectedVariety?.id,
      varietyCode: _selectedVariety?.code,
      varietyLabel: _selectedVariety?.name,
      pestId: _selectedPest?.id,
      pestLabel: _selectedPest?.name,
      diseaseId: _selectedDisease?.id,
      diseaseLabel: _selectedDisease?.name,
      lureId: _scoutingType == ScoutingType.lure
          ? _lureIdCtrl.text.trim()
          : null,
      stage: _selectedStage,
      locationOnPlant: _selectedLocation,
      severity: isCount ? 0 : _score,
      lureBugCount: _scoutingType == ScoutingType.lure ? _bugCount : 0,
      stickyTrapBugCount:
          _scoutingType == ScoutingType.stickyTrap ? _bugCount : 0,
      notes: _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
      localImagePath: localImagePath,
      imageUrl: imageUrl,
      gpsLat: _gpsLat,
      gpsLng: _gpsLng,
      verificationMethod: _gpsLat != null ? 'gps' : 'manual',
    );

    await _queueStore.add(entry);

    setState(() {
      _queue = [..._queue, entry];
      _resetEntryFields();
    });

    HapticFeedback.mediumImpact();
    _queueBadgeCtrl.forward(from: 0);

    if (!mounted) return;
    showToast(
      context,
      'Entry #${_queue.length} added to queue',
      kSuccess,
      bottomMargin: 80,
    );
  }

  Future<void> _removeFromQueue(int index) async {
    final entry = _queue[index];
    await _queueStore.remove(entry.clientRecordId);
    setState(() => _queue = List.of(_queue)..removeAt(index));
    HapticFeedback.lightImpact();
  }

  Future<void> _submitAll() async {
    if (_queue.isEmpty || _submitting) return;
    setState(() => _submitting = true);

    try {
      // Retry any photo uploads that failed while offline.
      final entries = <QueuedScoutingEntry>[];
      for (var entry in _queue) {
        if (entry.imageUrl == null && entry.localImagePath != null) {
          try {
            final url = await _api.uploadImage(
              token: widget.session.token,
              filePath: entry.localImagePath!,
            );
            entry = entry.copyWith(imageUrl: url);
            await _queueStore.update(entry);
          } catch (_) {
            // Submit the observation without the photo this round.
          }
        }
        entries.add(entry);
      }

      final payload =
          buildBatchPayload(batchId: _uuid.v4(), entries: entries);
      final result = await _api.submitScoutingBatch(
        token: widget.session.token,
        payload: payload,
      );

      final syncedIds = {...result.accepted, ...result.duplicates};
      await _queueStore.removeMany(syncedIds);
      await _loadQueue();

      if (!mounted) return;
      final count = result.accepted.length;
      final recNote = result.recommendationsCreated > 0
          ? ' · ${result.recommendationsCreated} recommendation'
              '${result.recommendationsCreated == 1 ? '' : 's'} raised'
          : '';
      showToast(context, '$count reports submitted successfully$recNote',
          kSuccess);
      Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        final offline = isOfflineError(e);
        showToast(
          context,
          offline
              ? 'No connection — entries stay queued on this device.'
              : 'Failed to submit: $e',
          offline ? kWarning : kError,
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _showQueueSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => StatefulBuilder(
        builder: (sheetCtx, setSheetState) => _QueueBottomSheet(
          queue: _queue,
          submitting: _submitting,
          onRemove: (i) async {
            await _removeFromQueue(i);
            if (_queue.isEmpty) {
              if (sheetCtx.mounted) Navigator.pop(sheetCtx);
            } else {
              setSheetState(() {});
            }
          },
          onSubmit: () {
            Navigator.pop(sheetCtx);
            _submitAll();
          },
        ),
      ),
    );
  }

  // ── Build ───────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final cache = ReferenceCache.instance;
    final accentColor = _scoutingType.color;

    return GestureDetector(
      onTap: () => FocusScope.of(context).unfocus(),
      child: Scaffold(
        resizeToAvoidBottomInset: true,
        backgroundColor: kSurface,
        appBar: AppBar(
          backgroundColor: kBackground,
          foregroundColor: kTextPrimary,
          elevation: 0,
          scrolledUnderElevation: .5,
          titleSpacing: 0,
          title: Text('New Scout Report', style: kSubheading()),
          actions: [
            if (_queue.isNotEmpty) ...[
              GestureDetector(
                onTap: _showQueueSheet,
                child: ScaleTransition(
                  scale: _queueBadgeAnim,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: kPrimary.withOpacity(0.08),
                      borderRadius: BorderRadius.circular(100),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.layers_outlined,
                          size: 15,
                          color: kPrimary,
                        ),
                        const SizedBox(width: 4),
                        Text('${_queue.length}',
                            style: kLabel(color: kPrimary)),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              _submitting
                  ? const Padding(
                      padding: EdgeInsets.only(right: 16),
                      child: Center(
                        child: SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            color: kPrimary,
                            strokeWidth: 2,
                          ),
                        ),
                      ),
                    )
                  : Padding(
                      padding: const EdgeInsets.only(right: 12),
                      child: TextButton.icon(
                        onPressed: _submitAll,
                        icon:
                            const Icon(Icons.cloud_upload_outlined, size: 16),
                        label:
                            Text('Submit', style: kLabel(color: Colors.white)),
                        style: TextButton.styleFrom(
                          foregroundColor: Colors.white,
                          backgroundColor: kSuccess,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(kRadius),
                          ),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 4,
                          ),
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                      ),
                    ),
            ],
          ],
        ),
        body: Form(
          key: _formKey,
          child: ListView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            children: [
              // ── Section: Location ──
              const SectionHeader(
                icon: Icons.location_on_outlined,
                label: 'Location',
              ),
              const SizedBox(height: 10),
              FormCard(
                children: [
                  CardField(
                    label: 'Greenhouse',
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 12,
                      ),
                      decoration: BoxDecoration(
                        color: kPrimary.withOpacity(0.06),
                        borderRadius: BorderRadius.circular(kRadiusMd),
                        border:
                            Border.all(color: kPrimary.withOpacity(0.2)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.house_outlined,
                              size: 18, color: kPrimary),
                          const SizedBox(width: 8),
                          Text(widget.greenhouse.label,
                              style: kBody(color: kPrimary)),
                          const Spacer(),
                          Icon(
                            _gpsLat != null
                                ? Icons.gps_fixed
                                : Icons.gps_off,
                            size: 15,
                            color: _gpsLat != null
                                ? kSuccess
                                : kTextSecondary.withOpacity(0.5),
                          ),
                        ],
                      ),
                    ),
                  ),
                  CardField(
                    label: 'Bed / Bay',
                    required: true,
                    child: _bedSuggestions.isNotEmpty
                        ? SearchableDropdown(
                            value: _bedCtrl.text.isEmpty
                                ? null
                                : _bedCtrl.text,
                            options: _bedSuggestions,
                            hint: 'Search bed…',
                            required: true,
                            commitFreeText: true,
                            onChanged: (v) => _bedCtrl.text = v ?? '',
                          )
                        : StyledInput(
                            controller: _bedCtrl,
                            hint: 'e.g. 3',
                            prefixIcon: Icons.grid_view_rounded,
                            validator: (v) => (v == null || v.trim().isEmpty)
                                ? 'Required'
                                : null,
                          ),
                  ),
                ],
              ),

              const SizedBox(height: 24),

              // ── Section: Scouting Type ──
              const SectionHeader(
                icon: Icons.category_outlined,
                label: 'Scouting Type',
              ),
              const SizedBox(height: 10),
              _TypeSelector(
                selected: _scoutingType,
                onChanged: (t) {
                  setState(() {
                    _scoutingType = t;
                    _resetEntryFields();
                  });
                  HapticFeedback.selectionClick();
                },
              ),

              const SizedBox(height: 24),

              // ── Section: Details ──
              SectionHeader(
                icon: _scoutingType.icon,
                label: '${_scoutingType.label} Details',
                accentColor: accentColor,
              ),
              const SizedBox(height: 10),
              FormCard(
                accentColor: accentColor,
                children: _buildTypeFields(cache),
              ),
            ],
          ),
        ),
        bottomNavigationBar: _BottomBar(
          onAdd: _addToQueue,
          processing: _processing,
          queueCount: _queue.length,
          onShowQueue: _queue.isNotEmpty ? _showQueueSheet : null,
        ),
      ),
    );
  }

  // ── Type-specific fields (Bloom's exact field order per type) ───────────────

  List<Widget> _buildTypeFields(ReferenceCache cache) {
    final accent = _scoutingType.color;

    Widget scoreRow(String label) => CardField(
      label: label,
      required: true,
      child: ScoreChips(
        value: _score,
        onChanged: (v) => setState(() => _score = v),
        accentColor: accent,
      ),
    );

    Widget countRow(String label) => CardField(
      label: label,
      required: true,
      child: CountStepper(
        value: _bugCount,
        onChanged: (v) => setState(() => _bugCount = v),
        accentColor: accent,
      ),
    );

    Widget notesField() => CardField(
      label: 'Notes',
      child: StyledInput(
        controller: _notesCtrl,
        hint: 'Observations…',
        multiline: true,
      ),
    );

    Widget photoField() => CardField(
      label: 'Photo',
      child: _PhotoPicker(
        image: _pickedImage,
        onPickCamera: () => _pickImage(ImageSource.camera),
        onPickGallery: () => _pickImage(ImageSource.gallery),
        onRemove: _removeImage,
      ),
    );

    Widget varietyField() => CardField(
      label: 'Variety',
      required: true,
      child: SearchableDropdown(
        value: _selectedVariety?.name,
        options: cache.varieties.map((v) => v.name).toList(),
        hint: 'Search variety…',
        required: true,
        onChanged: (name) => setState(() {
          _selectedVariety = _byName(cache.varieties, name, (v) => v.name);
        }),
      ),
    );

    Widget pestField() => CardField(
      label: 'Pest',
      required: true,
      child: StyledDropdown(
        value: _selectedPest?.name,
        options: cache.pests.map((p) => p.name).toList(),
        hint: 'Select pest…',
        required: true,
        onChanged: (name) => setState(() {
          _selectedPest = _byName(cache.pests, name, (p) => p.name);
        }),
      ),
    );

    Widget stageField() => CardField(
      label: 'Stage',
      required: true,
      child: StyledDropdown(
        value: _selectedStage,
        options: kStageOptions,
        hint: 'Select stage…',
        required: true,
        onChanged: (v) => setState(() => _selectedStage = v),
      ),
    );

    Widget locationField() => CardField(
      label: 'Where on the plant',
      required: true,
      child: StyledDropdown(
        value: _selectedLocation,
        options: kPlantLocationOptions,
        hint: 'Select location…',
        required: true,
        onChanged: (v) => setState(() => _selectedLocation = v),
      ),
    );

    switch (_scoutingType) {
      case ScoutingType.disease:
        return [
          CardField(
            label: 'Disease',
            required: true,
            child: StyledDropdown(
              value: _selectedDisease?.name,
              options: cache.diseases.map((d) => d.name).toList(),
              hint: 'Select disease…',
              required: true,
              onChanged: (name) => setState(() {
                _selectedDisease =
                    _byName(cache.diseases, name, (d) => d.name);
              }),
            ),
          ),
          locationField(),
          photoField(),
          varietyField(),
          scoreRow('Score'),
          notesField(),
          const SizedBox(height: 6),
        ];
      case ScoutingType.pest:
        return [
          pestField(),
          stageField(),
          locationField(),
          photoField(),
          varietyField(),
          scoreRow('Score'),
          notesField(),
          const SizedBox(height: 6),
        ];
      case ScoutingType.lure:
        return [
          CardField(
            label: 'Lure ID',
            required: true,
            child: StyledInput(
              controller: _lureIdCtrl,
              hint: 'Enter lure ID',
              validator: (v) =>
                  (v == null || v.trim().isEmpty) ? 'Required' : null,
            ),
          ),
          pestField(),
          stageField(),
          photoField(),
          varietyField(),
          countRow('Bug count'),
          notesField(),
          const SizedBox(height: 6),
        ];
      case ScoutingType.stickyTrap:
        return [
          pestField(),
          stageField(),
          photoField(),
          varietyField(),
          countRow('Bug count'),
          notesField(),
          const SizedBox(height: 6),
        ];
    }
  }

  T? _byName<T>(List<T> items, String? name, String Function(T) nameOf) {
    if (name == null) return null;
    for (final item in items) {
      if (nameOf(item) == name) return item;
    }
    return null;
  }
}

// ── Type selector (full-width pills) ──────────────────────────────────────────

class _TypeSelector extends StatelessWidget {
  const _TypeSelector({required this.selected, required this.onChanged});
  final ScoutingType selected;
  final ValueChanged<ScoutingType> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: kBackground,
        borderRadius: BorderRadius.circular(kRadiusLg),
        border: Border.all(color: kBorder),
      ),
      child: Row(
        children: ScoutingType.values.map((t) {
          final active = t == selected;
          return Expanded(
            child: GestureDetector(
              onTap: () => onChanged(t),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                curve: Curves.easeOut,
                padding: const EdgeInsets.symmetric(vertical: 10),
                decoration: BoxDecoration(
                  color: active ? t.color.withOpacity(0.12) : null,
                  borderRadius: BorderRadius.circular(kRadiusMd),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      t.icon,
                      size: 18,
                      color: active ? t.color : kTextSecondary,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      t.label,
                      style: GoogleFonts.nunito(
                        fontSize: 11,
                        fontWeight:
                            active ? FontWeight.w700 : FontWeight.w500,
                        color: active ? t.color : kTextSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

// ── Photo picker ──────────────────────────────────────────────────────────────

class _PhotoPicker extends StatelessWidget {
  const _PhotoPicker({
    required this.image,
    required this.onPickCamera,
    required this.onPickGallery,
    required this.onRemove,
  });

  final File? image;
  final VoidCallback onPickCamera;
  final VoidCallback onPickGallery;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    if (image == null) {
      return Row(
        children: [
          Expanded(
            child: _PhotoButton(
              icon: Icons.photo_camera_outlined,
              label: 'Camera',
              onTap: onPickCamera,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _PhotoButton(
              icon: Icons.photo_library_outlined,
              label: 'Gallery',
              onTap: onPickGallery,
            ),
          ),
        ],
      );
    }

    return Stack(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(kRadius),
          child: Image.file(
            image!,
            height: 160,
            width: double.infinity,
            fit: BoxFit.cover,
          ),
        ),
        Positioned(
          top: 6,
          right: 6,
          child: GestureDetector(
            onTap: onRemove,
            child: Container(
              padding: const EdgeInsets.all(5),
              decoration: const BoxDecoration(
                color: Colors.black54,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.close, size: 16, color: Colors.white),
            ),
          ),
        ),
      ],
    );
  }
}

class _PhotoButton extends StatelessWidget {
  const _PhotoButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: kSurface,
          borderRadius: BorderRadius.circular(kRadius),
          border: Border.all(color: kBorder),
        ),
        child: Column(
          children: [
            Icon(icon, size: 22, color: kTextSecondary),
            const SizedBox(height: 6),
            Text(label, style: kCaption(color: kTextSecondary)),
          ],
        ),
      ),
    );
  }
}

// ── Bottom action bar ─────────────────────────────────────────────────────────

class _BottomBar extends StatelessWidget {
  const _BottomBar({
    required this.onAdd,
    required this.processing,
    required this.queueCount,
    this.onShowQueue,
  });
  final VoidCallback onAdd;
  final bool processing;
  final int queueCount;
  final VoidCallback? onShowQueue;

  @override
  Widget build(BuildContext context) {
    final bottomPad = MediaQuery.of(context).padding.bottom;
    return Container(
      padding: EdgeInsets.fromLTRB(16, 10, 16, bottomPad + 10),
      decoration: BoxDecoration(
        color: kBackground,
        border: const Border(top: BorderSide(color: kBorder)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 8,
            offset: const Offset(0, -2),
          ),
        ],
      ),
      child: Row(
        children: [
          if (queueCount > 0) ...[
            GestureDetector(
              onTap: onShowQueue,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
                decoration: BoxDecoration(
                  color: kPrimary.withOpacity(0.06),
                  borderRadius: BorderRadius.circular(kRadiusMd),
                  border: Border.all(color: kPrimary.withOpacity(0.15)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.layers_outlined,
                        size: 16, color: kPrimary),
                    const SizedBox(width: 6),
                    Text('$queueCount', style: kLabel(color: kPrimary)),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 12),
          ],
          Expanded(
            child: Material(
              color: kPrimary,
              borderRadius: BorderRadius.circular(kRadiusMd),
              child: InkWell(
                onTap: processing ? null : onAdd,
                borderRadius: BorderRadius.circular(kRadiusMd),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (processing)
                        const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2,
                          ),
                        )
                      else
                        const Icon(Icons.add_rounded,
                            size: 20, color: Colors.white),
                      const SizedBox(width: 6),
                      Text(
                        processing ? 'Uploading photo…' : 'Add to Queue',
                        style: kLabel(color: Colors.white),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Queue bottom sheet ────────────────────────────────────────────────────────

class _QueueBottomSheet extends StatelessWidget {
  const _QueueBottomSheet({
    required this.queue,
    required this.onRemove,
    required this.onSubmit,
    required this.submitting,
  });
  final List<QueuedScoutingEntry> queue;
  final ValueChanged<int> onRemove;
  final VoidCallback onSubmit;
  final bool submitting;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.7,
      ),
      decoration: const BoxDecoration(
        color: kBackground,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 10),
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: kBorder,
              borderRadius: BorderRadius.circular(100),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
            child: Row(
              children: [
                Text('Queued Entries', style: kSubheading()),
                const SizedBox(width: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: kPrimary.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(100),
                  ),
                  child: Text('${queue.length}', style: kLabel(color: kPrimary)),
                ),
                const Spacer(),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close, color: kTextSecondary),
                  iconSize: 20,
                ),
              ],
            ),
          ),
          const Divider(height: 1, color: kBorder),
          Flexible(
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: queue.length,
              separatorBuilder: (_, i) => const Divider(
                height: 1,
                color: kBorder,
                indent: 20,
                endIndent: 20,
              ),
              itemBuilder: (_, i) {
                final entry = queue[i];
                final displayValue = entry.scoutingFor == ScoutingType.lure ||
                        entry.scoutingFor == ScoutingType.stickyTrap
                    ? entry.countValue
                    : entry.severity;
                return Dismissible(
                  key: ValueKey(entry.clientRecordId),
                  direction: DismissDirection.endToStart,
                  onDismissed: (_) => onRemove(i),
                  background: Container(
                    color: kError.withOpacity(0.1),
                    alignment: Alignment.centerRight,
                    padding: const EdgeInsets.only(right: 20),
                    child: const Icon(Icons.delete_outline, color: kError),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 10,
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            color: entry.scoutingFor.color.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(kRadius),
                          ),
                          child: Icon(
                            entry.scoutingFor.icon,
                            size: 20,
                            color: entry.scoutingFor.color,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${entry.scoutingFor.label} · Bed ${entry.bedCode}',
                                style: kLabel(),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                [
                                  entry.targetLabel,
                                  if (entry.varietyLabel != null)
                                    entry.varietyLabel!,
                                ].join(' · '),
                                style: kCaption(),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              if ((entry.stage ?? '').isNotEmpty ||
                                  (entry.locationOnPlant ?? '').isNotEmpty) ...[
                                const SizedBox(height: 2),
                                Text(
                                  [
                                    if ((entry.stage ?? '').isNotEmpty)
                                      entry.stage!,
                                    if ((entry.locationOnPlant ?? '')
                                        .isNotEmpty)
                                      entry.locationOnPlant!,
                                  ].join(' · '),
                                  style: kCaption(
                                    color: kTextSecondary.withOpacity(0.8),
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                              if (entry.imageUrl != null ||
                                  entry.localImagePath != null) ...[
                                const SizedBox(height: 2),
                                Row(
                                  children: [
                                    Icon(
                                      Icons.image_outlined,
                                      size: 12,
                                      color: kPrimary.withOpacity(0.7),
                                    ),
                                    const SizedBox(width: 3),
                                    Text(
                                      entry.imageUrl != null
                                          ? 'Photo attached'
                                          : 'Photo pending upload',
                                      style: kCaption(color: kPrimary),
                                    ),
                                  ],
                                ),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: entry.scoutingFor.color.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(kRadiusSm),
                          ),
                          child: Text(
                            '$displayValue',
                            style: kLabel(color: entry.scoutingFor.color),
                          ),
                        ),
                        const SizedBox(width: 8),
                        GestureDetector(
                          onTap: () => onRemove(i),
                          child: const Icon(
                            Icons.close,
                            size: 16,
                            color: kTextSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          const Divider(height: 1, color: kBorder),
          Padding(
            padding: EdgeInsets.fromLTRB(
              20,
              12,
              20,
              MediaQuery.of(context).padding.bottom + 12,
            ),
            child: SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: submitting ? null : onSubmit,
                icon: submitting
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          color: Colors.white,
                          strokeWidth: 2,
                        ),
                      )
                    : const Icon(Icons.cloud_upload_outlined, size: 18),
                label: Text(
                  submitting
                      ? 'Submitting…'
                      : 'Submit All (${queue.length})',
                  style: kLabel(color: Colors.white),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: kSuccess,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(kRadiusMd),
                  ),
                  elevation: 0,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
