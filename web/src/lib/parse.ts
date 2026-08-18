/**
 * Reading numbers back out of the fields that store them as text.
 *
 * Several spray columns are `VARCHAR`, not numeric, and hold a *label* rather
 * than a value: the server writes a rate as `f"{rate:g}/100L"`, so a rate of 75
 * is on the record as the string `"75/100L"`. Water volume is the same shape —
 * "1000 L".
 *
 * This is not cosmetic. `Number("75/100L")` is `NaN`, and the code that read it
 * collapsed `NaN` to `0` — which the API rejects, because rate and volume are
 * declared `gt=0` and zero is not a legal value where null is. That single
 * coercion silently emptied the product list of every spray programme being
 * edited, and the resulting validation error surfaced as "[object Object]".
 *
 * Kept here, exported and tested, rather than inline in the component: it is a
 * fact about the stored data, and the next screen that needs it should not have
 * to rediscover it.
 */

/**
 * The leading number in a stored value, or null when there is not one.
 *
 * Anchored to the front deliberately. "50 ml/100L" is a rate of 50, but
 * "ml/100L" is a unit with no rate in it at all — an unanchored match would
 * read the 100 out of the denominator and dose against it.
 *
 * Zero and negatives return null rather than their own value: no field this
 * parses accepts either, and returning 0 is what caused the original fault.
 */
export function looseNumber(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : null;
  const match = raw.replace(/,/g, "").trim().match(/^-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}
