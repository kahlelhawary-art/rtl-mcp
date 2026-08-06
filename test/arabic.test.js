import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeArabic, detectDirection } from "../src/arabic.js";

test("strips diacritics", () => {
  assert.equal(normalizeArabic("مُحَمَّد"), "محمد");
  assert.equal(normalizeArabic("السَّلامُ عَلَيْكُم"), "السلام عليكم");
});

test("strips tatweel", () => {
  assert.equal(normalizeArabic("مرحـــبا"), "مرحبا");
});

test("folds every alef form onto bare alef", () => {
  assert.equal(normalizeArabic("أحمد"), "احمد");
  assert.equal(normalizeArabic("إبراهيم"), "ابراهيم");
  assert.equal(normalizeArabic("آمنة"), "امنة");
});

test("leaves meaning-changing folds off by default", () => {
  assert.equal(normalizeArabic("مصطفى"), "مصطفى");
  assert.equal(normalizeArabic("مدرسة"), "مدرسة");
});

test("applies meaning-changing folds when asked", () => {
  assert.equal(normalizeArabic("مصطفى", { unifyAlefMaqsura: true }), "مصطفي");
  assert.equal(normalizeArabic("مدرسة", { unifyTaaMarbuta: true }), "مدرسه");
});

test("converts both Arabic-Indic digit sets", () => {
  assert.equal(normalizeArabic("٢٠٢٦", { convertDigits: true }), "2026");
  assert.equal(normalizeArabic("۲۰۲۶", { convertDigits: true }), "2026");
  assert.equal(normalizeArabic("٢٠٢٦"), "٢٠٢٦");
});

test("two spellings of the same name normalise to one key", () => {
  assert.equal(normalizeArabic("مُحَمَّدْ"), normalizeArabic("محمد"));
  assert.equal(normalizeArabic("أحـمد"), normalizeArabic("احمد"));
});

test("leaves Latin text untouched", () => {
  assert.equal(normalizeArabic("Hello, world!"), "Hello, world!");
});

test("collapses whitespace only when asked", () => {
  assert.equal(normalizeArabic("  a   b  ", { collapseWhitespace: true }), "a b");
  assert.equal(normalizeArabic("a   b"), "a   b");
});

test("detects a right-to-left string", () => {
  const report = detectDirection("مرحبا بالعالم");
  assert.equal(report.direction, "rtl");
  assert.match(report.recommendation, /dir="rtl"/);
});

test("detects a left-to-right string", () => {
  assert.equal(detectDirection("Hello world").direction, "ltr");
});

test("detects Hebrew as right-to-left", () => {
  assert.equal(detectDirection("שלום עולם").direction, "rtl");
});

test("reports mixed script and warns about it", () => {
  const report = detectDirection("مرحبا React");
  assert.equal(report.direction, "mixed");
  assert.match(report.recommendation, /Mixed script/);
  assert.ok(report.rtlCharacters > 0 && report.ltrCharacters > 0);
});

test("text with no letters is neutral", () => {
  const report = detectDirection("12:45 — €9.99");
  assert.equal(report.direction, "neutral");
  assert.equal(report.rtlCharacters, 0);
  assert.equal(report.ltrCharacters, 0);
});

test("digits alone do not decide direction", () => {
  assert.equal(detectDirection("٢٠٢٦").direction, "neutral");
});
