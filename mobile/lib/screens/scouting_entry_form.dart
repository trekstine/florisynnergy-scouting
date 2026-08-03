import 'dart:io';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:uuid/uuid.dart';

import '../models.dart';
import '../reference_cache.dart';
import '../widgets/searchable_select.dart';
import '../widgets/severity_slider.dart';

const _uuid = Uuid();

/// Null-safe "find by id" without pulling in `package:collection` just for
/// `firstWhereOrNull`.
T? _findById<T>(List<T> items, int? id, int Function(T) idOf) {
  if (id == null) return null;
  for (final item in items) {
    if (idOf(item) == id) return item;
  }
  return null;
}

/// The dynamic capture form — the heart of the field flow.
///
/// Bed/bay first, then the four-way scouting-type choice that reshapes the
/// rest of the form (disease/pest → variety + severity score; lure/sticky
/// trap → id/stage + catch count), exactly as specced: "the user enters the
/// bed or bay number, then there are four options... [each] determines how
/// the fields look."
///
/// Saving returns a [QueuedScoutingEntry] to the caller via `Navigator.pop`
/// — it does NOT talk to the network. Everything here is local-first; the
/// session screen owns the queue and the eventual batch submit.
class ScoutingEntryForm extends StatefulWidget {
  const ScoutingEntryForm({
    super.key,
    required this.greenhouse,
    required this.bedSuggestions,
    this.initialBedCode,
    this.initialType,
    this.editingEntry,
  });

  final Greenhouse greenhouse;
  final List<String> bedSuggestions;
  final String? initialBedCode;
  final ScoutingType? initialType;
  final QueuedScoutingEntry? editingEntry;

  @override
  State<ScoutingEntryForm> createState() => _ScoutingEntryFormState();
}

class _ScoutingEntryFormState extends State<ScoutingEntryForm> {
  late final String _initialBedText;
  TextEditingController? _bedFieldController;
  late final TextEditingController _lureIdController;
  late final TextEditingController _notesController;

  late ScoutingType _type;
  Disease? _disease;
  Pest? _pest;
  Variety? _variety;
  String? _stage;
  int _severity = 0;
  int _countValue = 0;
  int _beneficialsCount = 0;
  String? _localImagePath;
  double? _gpsLat;
  double? _gpsLng;
  bool _locating = true;
  String? _validationError;

  @override
  void initState() {
    super.initState();
    final editing = widget.editingEntry;
    _type = editing?.scoutingFor ?? widget.initialType ?? ScoutingType.disease;
    _initialBedText = editing?.bedCode ?? widget.initialBedCode ?? '';
    _lureIdController = TextEditingController(text: editing?.lureId ?? '');
    _notesController = TextEditingController(text: editing?.notes ?? '');
    _severity = editing?.severity ?? 0;
    _stage = editing?.stage;
    _beneficialsCount = editing?.beneficialsCount ?? 0;
    _localImagePath = editing?.localImagePath;
    _gpsLat = editing?.gpsLat;
    _gpsLng = editing?.gpsLng;
    _countValue = editing?.countValue ?? 0;

    if (editing != null) {
      final cache = ReferenceCache.instance;
      if (editing.diseaseId != null) {
        _disease = _findById(cache.diseases, editing.diseaseId, (d) => d.id);
      }
      if (editing.pestId != null) {
        _pest = _findById(cache.pests, editing.pestId, (p) => p.id);
      }
      if (editing.varietyId != null) {
        _variety = _findById(cache.varieties, editing.varietyId, (v) => v.id);
      }
      _locating = false;
    } else {
      _captureLocation();
    }
  }

  Future<void> _captureLocation() async {
    try {
      final permission = await Geolocator.checkPermission();
      var granted = permission == LocationPermission.always ||
          permission == LocationPermission.whileInUse;
      if (!granted && permission != LocationPermission.deniedForever) {
        final requested = await Geolocator.requestPermission();
        granted = requested == LocationPermission.always ||
            requested == LocationPermission.whileInUse;
      }
      if (granted) {
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
      // GPS is best-effort — a scout shouldn't be blocked by a cold fix or a
      // denied permission. The record still saves without coordinates.
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  Future<void> _pickPhoto() async {
    try {
      final picker = ImagePicker();
      final photo = await picker.pickImage(
        source: ImageSource.camera,
        maxWidth: 1600,
        imageQuality: 82,
      );
      if (photo != null) {
        setState(() => _localImagePath = photo.path);
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not open camera: $error')),
        );
      }
    }
  }

  @override
  void dispose() {
    _lureIdController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF2E7D32),
        foregroundColor: Colors.white,
        title: Text(widget.editingEntry == null ? 'New observation' : 'Edit observation'),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 18, 18, 120),
          children: [
            _sectionLabel('Greenhouse'),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                color: const Color(0xFFE8F5E9),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  const Icon(Icons.home_work_outlined, color: Color(0xFF2E7D32)),
                  const SizedBox(width: 10),
                  Text(
                    widget.greenhouse.label,
                    style: const TextStyle(fontWeight: FontWeight.w700, color: Color(0xFF1B5E20)),
                  ),
                  const Spacer(),
                  if (_locating)
                    const SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  else if (_gpsLat != null)
                    const Icon(Icons.gps_fixed, size: 16, color: Color(0xFF2E7D32))
                  else
                    const Icon(Icons.gps_off, size: 16, color: Color(0xFF9E9E9E)),
                ],
              ),
            ),
            const SizedBox(height: 20),
            _sectionLabel('Bed / bay number'),
            const SizedBox(height: 8),
            Autocomplete<String>(
              initialValue: TextEditingValue(text: _initialBedText),
              optionsBuilder: (v) {
                if (v.text.isEmpty) return widget.bedSuggestions;
                return widget.bedSuggestions.where(
                  (b) => b.toLowerCase().contains(v.text.toLowerCase()),
                );
              },
              fieldViewBuilder: (context, controller, focusNode, onSubmitted) {
                // Autocomplete owns this controller; we just keep a
                // reference so `_save()` can read the final bed text
                // (typed or selected from the suggestion list).
                _bedFieldController = controller;
                return TextField(
                  controller: controller,
                  focusNode: focusNode,
                  decoration: InputDecoration(
                    hintText: 'e.g. Bed 12 or Bay 4',
                    filled: true,
                    fillColor: const Color(0xFFF3F5EE),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(16),
                      borderSide: BorderSide.none,
                    ),
                  ),
                );
              },
            ),
            const SizedBox(height: 24),
            _sectionLabel('Scouting type'),
            const SizedBox(height: 10),
            _TypeSelector(value: _type, onChanged: _onTypeChanged),
            const SizedBox(height: 24),
            ..._buildTypeFields(),
            const SizedBox(height: 20),
            _sectionLabel('Notes'),
            const SizedBox(height: 8),
            TextField(
              controller: _notesController,
              maxLines: 4,
              decoration: InputDecoration(
                hintText: 'Observations, treatment context, anything unusual...',
                filled: true,
                fillColor: const Color(0xFFF3F5EE),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
            const SizedBox(height: 20),
            _sectionLabel('Photo (optional)'),
            const SizedBox(height: 8),
            _PhotoPicker(path: _localImagePath, onTap: _pickPhoto, onClear: () {
              setState(() => _localImagePath = null);
            }),
            if (_validationError != null) ...[
              const SizedBox(height: 16),
              Text(_validationError!, style: const TextStyle(color: Colors.redAccent)),
            ],
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 10, 18, 16),
          child: FilledButton.icon(
            onPressed: _save,
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF2E7D32),
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            ),
            icon: const Icon(Icons.playlist_add),
            label: Text(widget.editingEntry == null ? 'Add to queue' : 'Save changes'),
          ),
        ),
      ),
    );
  }

  Widget _sectionLabel(String text) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w700,
        color: Color(0xFF8A9A88),
        letterSpacing: 0.4,
      ),
    );
  }

  List<Widget> _buildTypeFields() {
    final cache = ReferenceCache.instance;
    switch (_type) {
      case ScoutingType.disease:
        return [
          SearchableSelect<Disease>(
            label: 'Disease',
            items: cache.diseases,
            labelBuilder: (d) => d.name,
            value: _disease,
            onSelected: (d) => setState(() => _disease = d),
          ),
          const SizedBox(height: 18),
          SearchableSelect<Variety>(
            label: 'Variety',
            items: cache.varieties,
            labelBuilder: (v) => v.label,
            value: _variety,
            onSelected: (v) => setState(() => _variety = v),
          ),
          const SizedBox(height: 20),
          SeveritySelector(
            label: 'Disease severity score',
            value: _severity,
            onChanged: (v) => setState(() => _severity = v),
          ),
        ];
      case ScoutingType.pest:
        return [
          SearchableSelect<Pest>(
            label: 'Pest',
            items: cache.pests,
            labelBuilder: (p) => p.name,
            value: _pest,
            onSelected: (p) => setState(() => _pest = p),
          ),
          const SizedBox(height: 18),
          SearchableSelect<Variety>(
            label: 'Variety',
            items: cache.varieties,
            labelBuilder: (v) => v.label,
            value: _variety,
            onSelected: (v) => setState(() => _variety = v),
          ),
          const SizedBox(height: 20),
          SeveritySelector(
            label: 'Pest severity score',
            value: _severity,
            onChanged: (v) => setState(() => _severity = v),
          ),
          const SizedBox(height: 18),
          _CountStepper(
            label: 'Insect count (optional)',
            value: _countValue,
            onChanged: (v) => setState(() => _countValue = v),
          ),
        ];
      case ScoutingType.lure:
        return [
          _sectionLabel('Lure ID'),
          const SizedBox(height: 8),
          TextField(
            controller: _lureIdController,
            decoration: InputDecoration(
              hintText: 'e.g. LR-014',
              filled: true,
              fillColor: const Color(0xFFF3F5EE),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: BorderSide.none,
              ),
            ),
          ),
          const SizedBox(height: 18),
          SearchableSelect<Pest>(
            label: 'Pest',
            items: cache.pests,
            labelBuilder: (p) => p.name,
            value: _pest,
            onSelected: (p) => setState(() => _pest = p),
          ),
          const SizedBox(height: 18),
          _StageSelect(value: _stage, onChanged: (s) => setState(() => _stage = s)),
          const SizedBox(height: 18),
          SearchableSelect<Variety>(
            label: 'Variety',
            items: cache.varieties,
            labelBuilder: (v) => v.label,
            value: _variety,
            onSelected: (v) => setState(() => _variety = v),
          ),
          const SizedBox(height: 18),
          _CountStepper(
            label: 'Bugs caught',
            value: _countValue,
            onChanged: (v) => setState(() => _countValue = v),
          ),
          const SizedBox(height: 18),
          _CountStepper(
            label: 'Beneficials seen (optional)',
            value: _beneficialsCount,
            onChanged: (v) => setState(() => _beneficialsCount = v),
          ),
          const SizedBox(height: 20),
          SeveritySelector(
            label: 'Pressure score',
            value: _severity,
            onChanged: (v) => setState(() => _severity = v),
          ),
        ];
      case ScoutingType.stickyTrap:
        return [
          SearchableSelect<Pest>(
            label: 'Pest',
            items: cache.pests,
            labelBuilder: (p) => p.name,
            value: _pest,
            onSelected: (p) => setState(() => _pest = p),
          ),
          const SizedBox(height: 18),
          _StageSelect(value: _stage, onChanged: (s) => setState(() => _stage = s)),
          const SizedBox(height: 18),
          SearchableSelect<Variety>(
            label: 'Variety',
            items: cache.varieties,
            labelBuilder: (v) => v.label,
            value: _variety,
            onSelected: (v) => setState(() => _variety = v),
          ),
          const SizedBox(height: 18),
          _CountStepper(
            label: 'Bugs caught',
            value: _countValue,
            onChanged: (v) => setState(() => _countValue = v),
          ),
          const SizedBox(height: 18),
          _CountStepper(
            label: 'Beneficials seen (optional)',
            value: _beneficialsCount,
            onChanged: (v) => setState(() => _beneficialsCount = v),
          ),
          const SizedBox(height: 20),
          SeveritySelector(
            label: 'Pressure score',
            value: _severity,
            onChanged: (v) => setState(() => _severity = v),
          ),
        ];
    }
  }

  void _onTypeChanged(ScoutingType type) {
    setState(() {
      _type = type;
      // Variety and bed carry over — a scout re-scoring the same plants for
      // a different threat is the common case. Type-specific selections
      // don't, so a stale pest doesn't silently ride along into a disease
      // entry.
      _disease = null;
      _pest = null;
      _stage = null;
      _countValue = 0;
      _severity = 0;
      _validationError = null;
    });
  }

  void _save() {
    final bed = (_bedFieldController?.text ?? _initialBedText).trim();
    if (bed.isEmpty) {
      setState(() => _validationError = 'Enter the bed or bay number.');
      return;
    }
    if (_variety == null) {
      setState(() => _validationError = 'Select a variety.');
      return;
    }
    if (_type == ScoutingType.disease && _disease == null) {
      setState(() => _validationError = 'Select a disease.');
      return;
    }
    if ((_type == ScoutingType.pest || _type == ScoutingType.stickyTrap) && _pest == null) {
      setState(() => _validationError = 'Select a pest.');
      return;
    }
    if (_type == ScoutingType.lure) {
      if (_lureIdController.text.trim().isEmpty) {
        setState(() => _validationError = 'Enter the lure ID.');
        return;
      }
      if (_pest == null) {
        setState(() => _validationError = 'Select the pest this lure targets.');
        return;
      }
    }

    final entry = QueuedScoutingEntry(
      clientRecordId: widget.editingEntry?.clientRecordId ?? _uuid.v4(),
      greenhouseId: widget.greenhouse.id,
      greenhouseLabel: widget.greenhouse.label,
      bedCode: bed,
      scoutingFor: _type,
      createdAt: widget.editingEntry?.createdAt ?? DateTime.now(),
      varietyId: _variety!.id,
      varietyCode: _variety!.code,
      varietyLabel: _variety!.label,
      pestId: _pest?.id,
      pestLabel: _pest?.name,
      diseaseId: _disease?.id,
      diseaseLabel: _disease?.name,
      lureId: _type == ScoutingType.lure ? _lureIdController.text.trim() : null,
      stage: _stage,
      severity: _severity,
      fcmCount: (_type == ScoutingType.pest) ? _countValue : 0,
      stickyTrapBugCount: _type == ScoutingType.stickyTrap ? _countValue : 0,
      lureBugCount: _type == ScoutingType.lure ? _countValue : 0,
      beneficialsCount: _beneficialsCount,
      notes: _notesController.text.trim().isEmpty ? null : _notesController.text.trim(),
      localImagePath: _localImagePath,
      imageUrl: widget.editingEntry?.imageUrl,
      gpsLat: _gpsLat,
      gpsLng: _gpsLng,
      verificationMethod: _gpsLat != null ? 'gps' : 'manual',
    );

    Navigator.of(context).pop(entry);
  }
}

class _TypeSelector extends StatelessWidget {
  const _TypeSelector({required this.value, required this.onChanged});

  final ScoutingType value;
  final ValueChanged<ScoutingType> onChanged;

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 2.6,
      children: ScoutingType.values.map((type) {
        final selected = type == value;
        return InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => onChanged(type),
          child: Container(
            decoration: BoxDecoration(
              color: selected ? const Color(0xFF2E7D32) : const Color(0xFFF3F5EE),
              borderRadius: BorderRadius.circular(16),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Row(
              children: [
                Icon(type.icon, color: selected ? Colors.white : const Color(0xFF2E7D32)),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    type.label,
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: selected ? Colors.white : const Color(0xFF2E4A2C),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }
}

class _StageSelect extends StatelessWidget {
  const _StageSelect({required this.value, required this.onChanged});

  final String? value;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Stage', style: TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF3A4A3B))),
        const SizedBox(height: 8),
        InputDecorator(
          decoration: InputDecoration(
            filled: true,
            fillColor: const Color(0xFFF3F5EE),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: BorderSide.none,
            ),
          ),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              value: value,
              isExpanded: true,
              hint: const Text('Select stage'),
              items: kLifecycleStages
                  .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                  .toList(),
              onChanged: onChanged,
            ),
          ),
        ),
      ],
    );
  }
}

class _CountStepper extends StatelessWidget {
  const _CountStepper({required this.label, required this.value, required this.onChanged});

  final String label;
  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF3A4A3B))),
        ),
        _RoundIconButton(icon: Icons.remove, onTap: value > 0 ? () => onChanged(value - 1) : null),
        SizedBox(
          width: 40,
          child: Text('$value', textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
        ),
        _RoundIconButton(icon: Icons.add, onTap: () => onChanged(value + 1)),
      ],
    );
  }
}

class _RoundIconButton extends StatelessWidget {
  const _RoundIconButton({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: onTap,
      child: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: onTap == null ? const Color(0xFFF3F5EE) : const Color(0xFFE8F5E9),
          shape: BoxShape.circle,
        ),
        child: Icon(icon, size: 18, color: onTap == null ? const Color(0xFFBDBDBD) : const Color(0xFF2E7D32)),
      ),
    );
  }
}

class _PhotoPicker extends StatelessWidget {
  const _PhotoPicker({required this.path, required this.onTap, required this.onClear});

  final String? path;
  final VoidCallback onTap;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    if (path == null) {
      return InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          height: 100,
          decoration: BoxDecoration(
            border: Border.all(color: const Color(0xFFCBD5C4), style: BorderStyle.solid),
            borderRadius: BorderRadius.circular(16),
          ),
          child: const Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.camera_alt_outlined, color: Color(0xFF2E7D32)),
                SizedBox(height: 6),
                Text('Attach a photo', style: TextStyle(color: Color(0xFF2E7D32), fontWeight: FontWeight.w600)),
              ],
            ),
          ),
        ),
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: Stack(
        children: [
          Image.file(File(path!), height: 160, width: double.infinity, fit: BoxFit.cover),
          Positioned(
            top: 8,
            right: 8,
            child: InkWell(
              onTap: onClear,
              child: Container(
                padding: const EdgeInsets.all(6),
                decoration: const BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
                child: const Icon(Icons.close, color: Colors.white, size: 18),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
