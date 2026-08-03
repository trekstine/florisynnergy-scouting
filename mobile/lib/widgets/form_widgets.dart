// Shared form widgets ported 1:1 from the Bloom app's add_scouting_screen —
// section headers, flat bordered cards with per-field labels, styled inputs
// and dropdowns, the keyboard-aware searchable dropdown, and score chips.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import '../theme.dart';

// ── Shared input decoration ───────────────────────────────────────────────────

InputDecoration inputDeco({IconData? prefixIcon}) => InputDecoration(
  prefixIcon: prefixIcon != null
      ? Icon(prefixIcon, size: 18, color: kTextSecondary)
      : null,
  filled: true,
  fillColor: kSurface,
  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
  border: OutlineInputBorder(
    borderRadius: BorderRadius.circular(kRadiusMd),
    borderSide: const BorderSide(color: kBorder),
  ),
  enabledBorder: OutlineInputBorder(
    borderRadius: BorderRadius.circular(kRadiusMd),
    borderSide: const BorderSide(color: kBorder),
  ),
  focusedBorder: OutlineInputBorder(
    borderRadius: BorderRadius.circular(kRadiusMd),
    borderSide: BorderSide(color: kPrimary.withOpacity(0.5), width: 1.5),
  ),
  errorBorder: OutlineInputBorder(
    borderRadius: BorderRadius.circular(kRadiusMd),
    borderSide: const BorderSide(color: kError),
  ),
  focusedErrorBorder: OutlineInputBorder(
    borderRadius: BorderRadius.circular(kRadiusMd),
    borderSide: const BorderSide(color: kError, width: 1.5),
  ),
  errorStyle: GoogleFonts.nunito(
    fontSize: 10,
    color: kError,
    fontWeight: FontWeight.w500,
  ),
  isDense: true,
);

// ── Section header with icon ──────────────────────────────────────────────────

class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.icon,
    required this.label,
    this.accentColor,
  });
  final IconData icon;
  final String label;
  final Color? accentColor;

  @override
  Widget build(BuildContext context) {
    final color = accentColor ?? kTextSecondary;
    return Row(
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 6),
        Text(
          label.toUpperCase(),
          style: GoogleFonts.nunito(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.8,
            color: color,
          ),
        ),
      ],
    );
  }
}

// ── Unified card container (optional colored accent strip on top) ─────────────

class FormCard extends StatelessWidget {
  const FormCard({super.key, required this.children, this.accentColor});
  final List<Widget> children;
  final Color? accentColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: kBackground,
        borderRadius: BorderRadius.circular(kRadiusLg),
        border: Border.all(color: kBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (accentColor != null) Container(height: 3, color: accentColor),
          ...children,
        ],
      ),
    );
  }
}

// ── Card field wrapper (label + required asterisk above the input) ────────────

class CardField extends StatelessWidget {
  const CardField({
    super.key,
    required this.label,
    required this.child,
    this.required = false,
  });
  final String label;
  final Widget child;
  final bool required;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(label, style: kLabel(color: kTextSecondary)),
              if (required) ...[
                const SizedBox(width: 3),
                Text('*', style: kCaption(color: kError)),
              ],
            ],
          ),
          const SizedBox(height: 8),
          child,
        ],
      ),
    );
  }
}

// ── Styled text input ─────────────────────────────────────────────────────────

class StyledInput extends StatelessWidget {
  const StyledInput({
    super.key,
    required this.controller,
    required this.hint,
    this.keyboardType,
    this.prefixIcon,
    this.validator,
    this.multiline = false,
  });
  final TextEditingController controller;
  final String hint;
  final TextInputType? keyboardType;
  final IconData? prefixIcon;
  final String? Function(String?)? validator;
  final bool multiline;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      validator: validator,
      keyboardType: multiline ? TextInputType.multiline : keyboardType,
      maxLines: multiline ? 3 : 1,
      minLines: multiline ? 2 : 1,
      style: kBody(),
      decoration: inputDeco(prefixIcon: prefixIcon).copyWith(
        hintText: hint,
        hintStyle: kBody(color: kTextSecondary.withOpacity(0.4)),
      ),
    );
  }
}

// ── Styled dropdown ───────────────────────────────────────────────────────────

class StyledDropdown extends StatelessWidget {
  const StyledDropdown({
    super.key,
    required this.value,
    required this.options,
    required this.hint,
    required this.onChanged,
    this.required = false,
    this.prefixIcon,
  });
  final String? value;
  final List<String> options;
  final String hint;
  final ValueChanged<String?> onChanged;
  final bool required;
  final IconData? prefixIcon;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String>(
      value: value,
      isExpanded: true,
      validator:
          required ? (v) => (v == null || v.isEmpty) ? 'Required' : null : null,
      hint: Text(hint, style: kBody(color: kTextSecondary.withOpacity(0.4))),
      icon: const Icon(
        Icons.keyboard_arrow_down_rounded,
        color: kTextSecondary,
        size: 20,
      ),
      decoration: inputDeco(prefixIcon: prefixIcon),
      style: kBody(),
      items: options
          .map((o) => DropdownMenuItem(value: o, child: Text(o, style: kBody())))
          .toList(),
      onChanged: onChanged,
    );
  }
}

// ── Searchable dropdown (overlay flips above the field when the keyboard
//    would cover the list — Bloom's exact behaviour) ──────────────────────────

class SearchableDropdown extends StatefulWidget {
  const SearchableDropdown({
    super.key,
    required this.value,
    required this.options,
    required this.hint,
    required this.required,
    required this.onChanged,
    this.commitFreeText = false,
  });
  final String? value;
  final List<String> options;
  final String hint;
  final bool required;
  final ValueChanged<String?> onChanged;

  /// When true, typed text is committed via [onChanged] as the user types —
  /// for fields like bed/bay where values outside the suggestion list are
  /// valid. When false (default), only a pick from the list commits.
  final bool commitFreeText;

  @override
  State<SearchableDropdown> createState() => _SearchableDropdownState();
}

class _SearchableDropdownState extends State<SearchableDropdown>
    with WidgetsBindingObserver {
  final _ctrl = TextEditingController();
  final _focusNode = FocusNode();
  List<String> _filtered = [];
  final _layerLink = LayerLink();
  OverlayEntry? _overlayEntry;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (widget.value != null) _ctrl.text = widget.value!;
    _filtered = widget.options;

    _focusNode.addListener(() {
      if (_focusNode.hasFocus) {
        _showOverlay();
      } else {
        _hideOverlay();
      }
    });
  }

  @override
  void didChangeMetrics() {
    if (_overlayEntry != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _focusNode.hasFocus) _showOverlay();
      });
    }
  }

  @override
  void didUpdateWidget(covariant SearchableDropdown oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.value != oldWidget.value) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _ctrl.text = widget.value ?? '';
      });
    }
    if (widget.options != oldWidget.options) {
      _filtered = widget.options;
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _hideOverlay();
    _ctrl.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _filter(String query) {
    setState(() {
      _filtered = query.isEmpty
          ? widget.options
          : widget.options
              .where((o) => o.toLowerCase().contains(query.toLowerCase()))
              .toList();
    });
    if (widget.commitFreeText) {
      widget.onChanged(query.trim().isEmpty ? null : query.trim());
    }
    _hideOverlay();
    _showOverlay();
  }

  void _pick(String value) {
    _ctrl.text = value;
    widget.onChanged(value);
    _focusNode.unfocus();
    _hideOverlay();
  }

  void _showOverlay() {
    _hideOverlay();
    if (!mounted) return;
    final renderBox = context.findRenderObject() as RenderBox?;
    if (renderBox == null || !renderBox.attached) return;

    final media = MediaQuery.of(context);
    final fieldTop = renderBox.localToGlobal(Offset.zero).dy;
    final fieldHeight = renderBox.size.height;
    final spaceBelow =
        media.size.height - media.viewInsets.bottom - (fieldTop + fieldHeight);
    final spaceAbove = fieldTop - media.padding.top;
    final showAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
    final maxHeight =
        (showAbove ? spaceAbove : spaceBelow).clamp(80.0, 240.0) - 12;

    _overlayEntry = OverlayEntry(
      builder: (ctx) => Positioned(
        width: renderBox.size.width,
        child: CompositedTransformFollower(
          link: _layerLink,
          showWhenUnlinked: false,
          targetAnchor: showAbove ? Alignment.topLeft : Alignment.bottomLeft,
          followerAnchor: showAbove ? Alignment.bottomLeft : Alignment.topLeft,
          offset: Offset(0, showAbove ? -4 : 4),
          child: Material(
            elevation: 6,
            shadowColor: Colors.black26,
            borderRadius: BorderRadius.circular(kRadiusMd),
            child: Container(
              constraints: BoxConstraints(maxHeight: maxHeight),
              decoration: BoxDecoration(
                color: kBackground,
                borderRadius: BorderRadius.circular(kRadiusMd),
                border: Border.all(color: kBorder),
              ),
              child: _filtered.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.all(12),
                      child: Text(
                        'No matches',
                        style: kCaption(color: kTextSecondary),
                      ),
                    )
                  : ListView.builder(
                      padding: EdgeInsets.zero,
                      shrinkWrap: true,
                      itemCount: _filtered.length,
                      itemBuilder: (_, i) => InkWell(
                        onTap: () => _pick(_filtered[i]),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 10,
                          ),
                          child: Text(_filtered[i], style: kBody()),
                        ),
                      ),
                    ),
            ),
          ),
        ),
      ),
    );
    Overlay.of(context).insert(_overlayEntry!);
  }

  void _hideOverlay() {
    _overlayEntry?.remove();
    _overlayEntry = null;
  }

  @override
  Widget build(BuildContext context) {
    return CompositedTransformTarget(
      link: _layerLink,
      child: TextFormField(
        controller: _ctrl,
        focusNode: _focusNode,
        validator: widget.required
            ? (v) => (v == null || v.trim().isEmpty) ? 'Required' : null
            : null,
        style: kBody(),
        onChanged: _filter,
        decoration: inputDeco(prefixIcon: Icons.search).copyWith(
          hintText: widget.hint,
          hintStyle: kBody(color: kTextSecondary.withOpacity(0.4)),
        ),
      ),
    );
  }
}

// ── Score chips (0–5 to match the backend severity scale) ─────────────────────

class ScoreChips extends StatelessWidget {
  const ScoreChips({
    super.key,
    required this.value,
    required this.onChanged,
    this.accentColor,
    this.min = 0,
    this.max = 5,
  });
  final int value;
  final ValueChanged<int> onChanged;
  final Color? accentColor;
  final int min;
  final int max;

  @override
  Widget build(BuildContext context) {
    final color = accentColor ?? kPrimary;
    final count = max - min + 1;
    return Row(
      children: List.generate(count, (i) {
        final n = min + i;
        final active = n == value;
        return Expanded(
          child: GestureDetector(
            onTap: () {
              onChanged(n);
              HapticFeedback.selectionClick();
            },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 140),
              margin: EdgeInsets.only(right: i == count - 1 ? 0 : 6),
              padding: const EdgeInsets.symmetric(vertical: 11),
              decoration: BoxDecoration(
                color: active ? color.withOpacity(0.14) : kSurface,
                borderRadius: BorderRadius.circular(kRadius),
                border: Border.all(
                  color: active ? color.withOpacity(0.6) : kBorder,
                  width: active ? 1.5 : 1,
                ),
              ),
              child: Center(
                child: Text(
                  '$n',
                  style: GoogleFonts.nunito(
                    fontSize: 13,
                    fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                    color: active ? color : kTextSecondary,
                  ),
                ),
              ),
            ),
          ),
        );
      }),
    );
  }
}

// ── Count stepper (bug counts can exceed a fixed chip range) ──────────────────

class CountStepper extends StatelessWidget {
  const CountStepper({
    super.key,
    required this.value,
    required this.onChanged,
    this.accentColor,
  });
  final int value;
  final ValueChanged<int> onChanged;
  final Color? accentColor;

  @override
  Widget build(BuildContext context) {
    final color = accentColor ?? kPrimary;
    return Container(
      decoration: BoxDecoration(
        color: kSurface,
        borderRadius: BorderRadius.circular(kRadiusMd),
        border: Border.all(color: kBorder),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
      child: Row(
        children: [
          _StepBtn(
            icon: Icons.remove_rounded,
            enabled: value > 0,
            color: color,
            onTap: () {
              onChanged(value - 1);
              HapticFeedback.selectionClick();
            },
          ),
          Expanded(
            child: Center(
              child: Text(
                '$value',
                style: GoogleFonts.nunito(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: kTextPrimary,
                ),
              ),
            ),
          ),
          _StepBtn(
            icon: Icons.add_rounded,
            enabled: true,
            color: color,
            onTap: () {
              onChanged(value + 1);
              HapticFeedback.selectionClick();
            },
          ),
        ],
      ),
    );
  }
}

class _StepBtn extends StatelessWidget {
  const _StepBtn({
    required this.icon,
    required this.enabled,
    required this.color,
    required this.onTap,
  });
  final IconData icon;
  final bool enabled;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: enabled ? onTap : null,
      child: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          color: enabled ? color.withOpacity(0.1) : kBackground,
          borderRadius: BorderRadius.circular(kRadius),
          border: Border.all(
            color: enabled ? color.withOpacity(0.3) : kBorder,
          ),
        ),
        child: Icon(
          icon,
          size: 20,
          color: enabled ? color : kTextSecondary.withOpacity(0.4),
        ),
      ),
    );
  }
}

// ── Small colored chip ────────────────────────────────────────────────────────

class MiniChip extends StatelessWidget {
  const MiniChip({super.key, required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(100),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Text(
        label.length > 22 ? '${label.substring(0, 20)}…' : label,
        style: GoogleFonts.nunito(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }
}
