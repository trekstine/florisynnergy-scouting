import 'package:flutter/material.dart';

/// A type-to-filter single-select field, used for every reference-data
/// dropdown in the entry form (variety, pest, disease...). Some of these
/// lists run to 50+ items — plain `DropdownButton` menus get unusable at
/// that length on a phone, so this wraps `Autocomplete` with the same visual
/// language as the rest of the form's fields.
class SearchableSelect<T extends Object> extends StatelessWidget {
  const SearchableSelect({
    super.key,
    required this.label,
    required this.items,
    required this.labelBuilder,
    required this.onSelected,
    this.value,
    this.hintText,
    this.errorText,
  });

  final String label;
  final List<T> items;
  final String Function(T) labelBuilder;
  final ValueChanged<T> onSelected;
  final T? value;
  final String? hintText;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(fontWeight: FontWeight.w600, color: Color(0xFF3A4A3B)),
        ),
        const SizedBox(height: 8),
        Autocomplete<T>(
          initialValue: TextEditingValue(text: value != null ? labelBuilder(value as T) : ''),
          displayStringForOption: labelBuilder,
          optionsBuilder: (textEditingValue) {
            if (textEditingValue.text.isEmpty) return items;
            final query = textEditingValue.text.toLowerCase();
            return items.where((item) => labelBuilder(item).toLowerCase().contains(query));
          },
          onSelected: onSelected,
          fieldViewBuilder: (context, controller, focusNode, onSubmitted) {
            return TextField(
              controller: controller,
              focusNode: focusNode,
              decoration: InputDecoration(
                hintText: hintText ?? 'Search $label'.toLowerCase(),
                filled: true,
                fillColor: const Color(0xFFF3F5EE),
                suffixIcon: const Icon(Icons.search, size: 20),
                errorText: errorText,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(16),
                  borderSide: BorderSide.none,
                ),
              ),
            );
          },
          optionsViewBuilder: (context, onSelectedCallback, options) {
            return Align(
              alignment: Alignment.topLeft,
              child: Material(
                elevation: 6,
                borderRadius: BorderRadius.circular(16),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxHeight: 260, maxWidth: 420),
                  child: ListView.builder(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    shrinkWrap: true,
                    itemCount: options.length,
                    itemBuilder: (context, index) {
                      final option = options.elementAt(index);
                      return ListTile(
                        dense: true,
                        title: Text(labelBuilder(option)),
                        onTap: () => onSelectedCallback(option),
                      );
                    },
                  ),
                ),
              ),
            );
          },
        ),
      ],
    );
  }
}
