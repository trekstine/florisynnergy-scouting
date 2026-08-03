// Design system ported from the Bloom (credible_blooms) scouting app —
// the reference for this app's look and feel. Same palette, type scale,
// radii, and flat-bordered surfaces so scouts moving between the two apps
// feel zero friction.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

// ─── Colour palette ───────────────────────────────────────────────────────────
const Color kPrimary = Color(0xFF514978);
const Color kBackground = Color(0xFFFFFFFF);
const Color kSurface = Color(0xFFF7F7F9);
const Color kBorder = Color(0xFFE4E4E7);
const Color kTextPrimary = Color(0xFF18181B);
const Color kTextSecondary = Color(0xFF71717A);
const Color kSuccess = Color(0xFF16A34A);
const Color kError = Color(0xFFDC2626);
const Color kWarning = Color(0xFFD97706);
const Color kLureBlue = Color(0xFF0284C7);
const Color kTrapViolet = Color(0xFF7C3AED);

// ─── Border radius ────────────────────────────────────────────────────────────
const double kRadiusSm = 6.0;
const double kRadius = 8.0;
const double kRadiusMd = 10.0;
const double kRadiusLg = 12.0;

// ─── Severity (0–5 scale, matching the backend + web portal) ─────────────────
Color severityColor(int s) {
  if (s <= 0) return kTextSecondary;
  if (s <= 2) return kSuccess;
  if (s == 3) return kWarning;
  return kError;
}

// ─── Reusable decorations ─────────────────────────────────────────────────────
BoxDecoration kCardDecoration({Color? color}) => BoxDecoration(
  color: color ?? kBackground,
  borderRadius: BorderRadius.circular(kRadius),
  border: Border.all(color: kBorder),
);

// ─── Text styles ──────────────────────────────────────────────────────────────
TextStyle kDisplay({Color color = kTextPrimary}) =>
    GoogleFonts.nunito(fontSize: 28, fontWeight: FontWeight.w800, color: color);

TextStyle kHeading({Color color = kTextPrimary}) =>
    GoogleFonts.nunito(fontSize: 20, fontWeight: FontWeight.w700, color: color);

TextStyle kSubheading({Color color = kTextPrimary}) =>
    GoogleFonts.nunito(fontSize: 16, fontWeight: FontWeight.w600, color: color);

TextStyle kBodyLg({Color color = kTextPrimary}) =>
    GoogleFonts.nunito(fontSize: 15, fontWeight: FontWeight.w500, color: color);

TextStyle kBody({Color color = kTextPrimary}) =>
    GoogleFonts.nunito(fontSize: 14, fontWeight: FontWeight.w400, color: color);

TextStyle kLabel({Color color = kTextPrimary}) =>
    GoogleFonts.nunito(fontSize: 13, fontWeight: FontWeight.w600, color: color);

TextStyle kCaption({Color color = kTextSecondary}) =>
    GoogleFonts.nunito(fontSize: 12, fontWeight: FontWeight.w400, color: color);

// ─── Floating snackbar helper (Bloom pattern) ─────────────────────────────────
void showToast(BuildContext context, String message, Color color,
    {double bottomMargin = 16}) {
  ScaffoldMessenger.of(context).clearSnackBars();
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(message, style: kBody(color: Colors.white)),
      backgroundColor: color,
      behavior: SnackBarBehavior.floating,
      margin: EdgeInsets.fromLTRB(16, 0, 16, bottomMargin),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(kRadius)),
    ),
  );
}

// ─── App-wide ThemeData ───────────────────────────────────────────────────────
ThemeData buildAppTheme() {
  final base = ThemeData.light(useMaterial3: true);

  return base.copyWith(
    primaryColor: kPrimary,
    scaffoldBackgroundColor: kBackground,
    colorScheme: const ColorScheme.light(
      primary: kPrimary,
      surface: kSurface,
      error: kError,
    ),
    textTheme: GoogleFonts.nunitoTextTheme(
      base.textTheme,
    ).apply(bodyColor: kTextPrimary, displayColor: kTextPrimary),
    appBarTheme: AppBarTheme(
      backgroundColor: kBackground,
      foregroundColor: kTextPrimary,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      systemOverlayStyle: SystemUiOverlayStyle.dark,
      titleTextStyle: GoogleFonts.nunito(
        fontSize: 18,
        fontWeight: FontWeight.w700,
        color: kTextPrimary,
      ),
      iconTheme: const IconThemeData(color: kTextPrimary, size: 22),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: kBackground,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      hintStyle: GoogleFonts.nunito(fontSize: 14, color: kTextSecondary),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(kRadius),
        borderSide: const BorderSide(color: kBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(kRadius),
        borderSide: const BorderSide(color: kBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(kRadius),
        borderSide: const BorderSide(color: kPrimary, width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(kRadius),
        borderSide: const BorderSide(color: kError),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(kRadius),
        borderSide: const BorderSide(color: kError, width: 1.5),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: kPrimary,
        foregroundColor: kBackground,
        elevation: 0,
        shadowColor: Colors.transparent,
        minimumSize: const Size(double.infinity, 50),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(kRadius),
        ),
        textStyle: GoogleFonts.nunito(
          fontSize: 15,
          fontWeight: FontWeight.w700,
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: kPrimary,
        side: const BorderSide(color: kPrimary),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(kRadius),
        ),
        textStyle: GoogleFonts.nunito(
          fontSize: 14,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    dividerTheme: const DividerThemeData(
      color: kBorder,
      thickness: 1,
      space: 1,
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: kBackground,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(kRadius),
        side: const BorderSide(color: kBorder),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(kRadius),
      ),
      contentTextStyle: GoogleFonts.nunito(
        fontSize: 13,
        fontWeight: FontWeight.w500,
      ),
    ),
  );
}
