/**
 * Arabic text normalisation and script-direction detection.
 *
 * Search and comparison over Arabic fails in ways that look like bugs in the
 * database: "مُحَمَّد" and "محمد" are the same name, but not the same string.
 * Normalising collapses the forms that users type interchangeably.
 */

/** Tashkeel: fathatan through sukun, plus the superscript alef and its neighbours. */
const DIACRITICS = /[ً-ٰٕ]/g;

/** Tatweel — the decorative line that stretches a word. */
const TATWEEL = /ـ/g;

/** Alef with hamza above/below, madda, and wasla all normalise to bare alef. */
const ALEF_FORMS = /[آأإٱ]/g;

const ARABIC_INDIC = /[٠-٩]/g;
const EXTENDED_ARABIC_INDIC = /[۰-۹]/g;

/** Ranges whose characters are written right-to-left. */
const RTL_RANGES = [
  [0x0590, 0x05ff], // Hebrew
  [0x0600, 0x06ff], // Arabic
  [0x0700, 0x074f], // Syriac
  [0x0750, 0x077f], // Arabic Supplement
  [0x0780, 0x07bf], // Thaana
  [0x07c0, 0x07ff], // NKo
  [0x08a0, 0x08ff], // Arabic Extended-A
  [0xfb1d, 0xfb4f], // Hebrew presentation forms
  [0xfb50, 0xfdff], // Arabic presentation forms A
  [0xfe70, 0xfeff], // Arabic presentation forms B
];

function inRanges(code, ranges) {
  return ranges.some(([from, to]) => code >= from && code <= to);
}

/**
 * @typedef {object} NormalizeOptions
 * @property {boolean} [removeDiacritics=true] Strip tashkeel.
 * @property {boolean} [removeTatweel=true] Strip the stretching character.
 * @property {boolean} [unifyAlef=true] Fold أ إ آ ٱ into ا.
 * @property {boolean} [unifyAlefMaqsura=false] Fold ى into ي.
 * @property {boolean} [unifyTaaMarbuta=false] Fold ة into ه.
 * @property {boolean} [convertDigits=false] Convert ٠-٩ and ۰-۹ into 0-9.
 * @property {boolean} [collapseWhitespace=false] Collapse runs of whitespace.
 */

/**
 * Normalise Arabic text.
 *
 * The two folds that change meaning — alef maqsura and taa marbuta — are off
 * by default. They help fuzzy search but corrupt text meant for display.
 *
 * @param {string} text
 * @param {NormalizeOptions} [options]
 * @returns {string}
 */
export function normalizeArabic(text, options = {}) {
  const {
    removeDiacritics = true,
    removeTatweel = true,
    unifyAlef = true,
    unifyAlefMaqsura = false,
    unifyTaaMarbuta = false,
    convertDigits = false,
    collapseWhitespace = false,
  } = options;

  let out = text;
  if (removeDiacritics) out = out.replace(DIACRITICS, "");
  if (removeTatweel) out = out.replace(TATWEEL, "");
  if (unifyAlef) out = out.replace(ALEF_FORMS, "ا");
  if (unifyAlefMaqsura) out = out.replaceAll("ى", "ي");
  if (unifyTaaMarbuta) out = out.replaceAll("ة", "ه");
  if (convertDigits) {
    out = out
      .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(EXTENDED_ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x06f0));
  }
  if (collapseWhitespace) out = out.replace(/\s+/g, " ").trim();
  return out;
}

/**
 * @typedef {object} DirectionReport
 * @property {"rtl"|"ltr"|"mixed"|"neutral"} direction
 * @property {number} rtlCharacters
 * @property {number} ltrCharacters
 * @property {number} rtlShare fraction of directional characters that are RTL
 * @property {string} recommendation what to put in the dir attribute
 */

/**
 * Report which script direction dominates a string.
 *
 * Text with no letters at all — digits, punctuation, emoji — is `neutral`:
 * it inherits direction from its container rather than setting one.
 *
 * @param {string} text
 * @returns {DirectionReport}
 */
export function detectDirection(text) {
  let rtl = 0;
  let ltr = 0;

  for (const char of text) {
    // Only strong characters — letters — decide direction. Arabic-Indic
    // digits sit inside the Arabic block but are bidi class AN, and
    // diacritics and Arabic punctuation are weak or neutral: none of them
    // set the direction of a paragraph.
    if (!/\p{Letter}/u.test(char)) continue;
    if (inRanges(char.codePointAt(0), RTL_RANGES)) rtl++;
    else ltr++;
  }

  const total = rtl + ltr;
  if (total === 0) {
    return {
      direction: "neutral",
      rtlCharacters: 0,
      ltrCharacters: 0,
      rtlShare: 0,
      recommendation: 'No letters found — leave dir unset so the text inherits its container.',
    };
  }

  const rtlShare = rtl / total;
  let direction;
  if (rtlShare >= 0.9) direction = "rtl";
  else if (rtlShare <= 0.1) direction = "ltr";
  else direction = "mixed";

  const recommendation =
    direction === "mixed"
      ? `Mixed script (${Math.round(rtlShare * 100)}% RTL). Set dir on the dominant side and wrap the runs of the other script in their own element, or the punctuation will land in the wrong place.`
      : `Set dir="${direction}".`;

  return { direction, rtlCharacters: rtl, ltrCharacters: ltr, rtlShare, recommendation };
}
