import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models.dart';

class ScoutCaptureScreen extends ConsumerWidget {
  const ScoutCaptureScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final greenhouseTiles = List.generate(
      11,
      (index) => Greenhouse(
        id: index + 1,
        name: 'GH ${index + 1}',
        available: index == 0,
      ),
    );

    final reports = [
      ScoutingReportSummary(
        title: 'Botrytis',
        greenhouse: 'GH1',
        bed: 'Bed 45',
        status: 'BELLEROSE',
        severity: 4,
        tag: 'Botrytis 4/10',
        timestamp: 'Jul 27',
        color: const Color(0xFFEF9A9A),
      ),
      ScoutingReportSummary(
        title: 'Mites',
        greenhouse: 'GH1',
        bed: 'Bed 2',
        status: 'CONFIDENTIAL',
        severity: 1,
        tag: 'Mites 1/10',
        timestamp: 'Jul 16',
        color: const Color(0xFF81C784),
      ),
      ScoutingReportSummary(
        title: 'Powdery mildew',
        greenhouse: 'GH1',
        bed: 'Bed 2',
        status: 'CONFIDENTIAL',
        severity: 3,
        tag: 'Powdery mildew 3/10',
        timestamp: 'Jul 16',
        color: const Color(0xFF81C784),
      ),
    ];

    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF2E7D32),
        foregroundColor: Colors.white,
        elevation: 0,
        title: const Text('Scouting'),
        actions: [
          IconButton(icon: const Icon(Icons.settings), onPressed: () {}),
          IconButton(icon: const Icon(Icons.person), onPressed: () {}),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
        child: Column(
          children: [
            _buildGreenhouseGrid(greenhouseTiles),
            const SizedBox(height: 18),
            Expanded(
              child: ListView.separated(
                itemCount: reports.length,
                separatorBuilder: (context, index) =>
                    const SizedBox(height: 14),
                itemBuilder: (context, index) {
                  return _ScoutingCard(report: reports[index]);
                },
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {},
        backgroundColor: const Color(0xFF2E7D32),
        icon: const Icon(Icons.add),
        label: const Text('New Report'),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerFloat,
    );
  }

  Widget _buildGreenhouseGrid(List<Greenhouse> list) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: list.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 1.05,
      ),
      itemBuilder: (context, index) {
        final greenhouse = list[index];
        return _GreenhouseTile(greenhouse: greenhouse);
      },
    );
  }
}

class _GreenhouseTile extends StatelessWidget {
  const _GreenhouseTile({required this.greenhouse});

  final Greenhouse greenhouse;

  @override
  Widget build(BuildContext context) {
    final borderColor = greenhouse.available
        ? const Color(0xFF2E7D32)
        : Colors.white;
    final bgColor = greenhouse.available
        ? const Color(0xFFE8F5E9)
        : Colors.white;
    final statusColor = greenhouse.available
        ? const Color(0xFF2E7D32)
        : const Color(0xFFEF9A9A);

    return Container(
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: borderColor, width: 1.4),
        boxShadow: const [
          BoxShadow(
            color: Color(0x12000000),
            blurRadius: 10,
            offset: Offset(0, 4),
          ),
        ],
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.home,
            size: 28,
            color: greenhouse.available
                ? const Color(0xFF2E7D32)
                : const Color(0xFFB0B0B0),
          ),
          const SizedBox(height: 10),
          Text(
            greenhouse.label,
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: greenhouse.available
                  ? const Color(0xFF2E7D32)
                  : const Color(0xFF9E9E9E),
            ),
          ),
          const SizedBox(height: 8),
          Container(
            decoration: BoxDecoration(
              color: Color.lerp(statusColor, Colors.white, 0.88),
              borderRadius: BorderRadius.circular(999),
            ),
            padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 12),
            child: Text(
              greenhouse.available ? 'In Range' : 'Out of Range',
              style: TextStyle(
                fontSize: 12,
                color: statusColor,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ScoutingCard extends StatelessWidget {
  const _ScoutingCard({required this.report});

  final ScoutingReportSummary report;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: Color.lerp(report.color, Colors.white, 0.82),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(Icons.bug_report, color: report.color),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        report.title,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        '${report.greenhouse} · ${report.status}',
                        style: const TextStyle(color: Color(0xFF6D6D6D)),
                      ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      report.timestamp,
                      style: const TextStyle(color: Color(0xFF6D6D6D)),
                    ),
                    const SizedBox(height: 8),
                    const Icon(Icons.chevron_right, color: Color(0xFF9E9E9E)),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _TagChip(label: report.bed),
                _TagChip(
                  label: report.tag,
                  color: const Color(0xFFE8F5E9),
                  textColor: const Color(0xFF2E7D32),
                ),
              ],
            ),
            const SizedBox(height: 14),
            const Text(
              'Scout Test',
              style: TextStyle(color: Color(0xFF8A8A8A)),
            ),
          ],
        ),
      ),
    );
  }
}

class _TagChip extends StatelessWidget {
  const _TagChip({
    required this.label,
    this.color = const Color(0xFFF3F5EE),
    this.textColor = const Color(0xFF4F5B50),
  });

  final String label;
  final Color color;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 13,
          color: textColor,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
