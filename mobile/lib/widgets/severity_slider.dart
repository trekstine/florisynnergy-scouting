import 'package:flutter/material.dart';

/// Green→red 0–5 severity scale, matching `severityHex()` in the web
/// portal's `lib/format.ts` exactly so a "4" looks the same shade of red on
/// a phone in the greenhouse as it does on a supervisor's dashboard.
const List<Color> kSeverityScale = [
  Color(0xFFE2E8F0),
  Color(0xFFBBF7D0),
  Color(0xFFFDE68A),
  Color(0xFFFDBA74),
  Color(0xFFF87171),
  Color(0xFFDC2626),
];

const List<String> kSeverityLabels = [
  'None',
  'Low',
  'Moderate',
  'High',
  'Severe',
  'Critical',
];

/// A tap-to-set 0–5 severity picker — deliberately not a drag slider, since
/// a scout is often holding a plant stem or a phone one-handed. Six big
/// targets are faster and more reliable than dragging a thumb precisely.
class SeveritySelector extends StatelessWidget {
  const SeveritySelector({
    super.key,
    required this.value,
    required this.onChanged,
    this.label = 'Severity score',
  });

  final int value;
  final ValueChanged<int> onChanged;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF3A4A3B)),
        ),
        const SizedBox(height: 10),
        Row(
          children: List.generate(6, (i) {
            final selected = i == value;
            return Expanded(
              child: GestureDetector(
                onTap: () => onChanged(i),
                child: Container(
                  margin: EdgeInsets.only(right: i == 5 ? 0 : 8),
                  height: 52,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: kSeverityScale[i],
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: selected ? const Color(0xFF1B5E20) : Colors.transparent,
                      width: 2.5,
                    ),
                  ),
                  child: Text(
                    '$i',
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                      color: i >= 4 ? Colors.white : const Color(0xFF3A4A3B),
                    ),
                  ),
                ),
              ),
            );
          }),
        ),
        const SizedBox(height: 8),
        Text(
          '${kSeverityLabels[value]} · $value / 5',
          style: TextStyle(
            fontWeight: FontWeight.w600,
            color: Color.lerp(const Color(0xFF2E7D32), const Color(0xFFB71C1C), value / 5),
          ),
        ),
      ],
    );
  }
}
