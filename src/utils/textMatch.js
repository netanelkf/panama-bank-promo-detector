const crypto = require('crypto');

// Collapses whitespace but keeps original casing/accents — used for snippets
// shown to users.
function cleanWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

// Strips accents and lowercases so "Compra de Saldo" matches "compra de saldo"
// regardless of accents/case used on the page.
function normalize(text) {
  return cleanWhitespace(
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
  );
}

function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// Builds a version of `text` where accents are stripped and case is lowered
// character-by-character, plus a map from each normalized index back to the
// original index. Lets us search on normalized text but cut snippets from the
// original (readable) text.
function buildSearchIndex(text) {
  const original = cleanWhitespace(text);
  let normalized = '';
  const map = [];
  for (let i = 0; i < original.length; i++) {
    const stripped = original[i].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    for (const ch of stripped) {
      normalized += ch;
      map.push(i);
    }
  }
  return { original, normalized, map };
}

// Returns every occurrence of every keyword, sorted by position.
function findAllKeywordMatches(normalizedText, keywords) {
  const matches = [];
  for (const keyword of keywords) {
    const needle = normalize(keyword);
    if (!needle) continue;
    let from = 0;
    let index;
    while ((index = normalizedText.indexOf(needle, from)) !== -1) {
      matches.push({ keyword, index, length: needle.length });
      from = index + needle.length;
    }
  }
  return matches.sort((a, b) => a.index - b.index);
}

// Backwards-compatible: first match only.
function findKeywordMatch(normalizedText, keywords) {
  return findAllKeywordMatches(normalizedText, keywords)[0] || null;
}

function extractSnippet(text, index, radius = 180) {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  const prefix = start > 0 ? '… ' : '';
  const suffix = end < text.length ? ' …' : '';
  return prefix + text.slice(start, end).trim() + suffix;
}

const MAX_BLOCK = 600;
const FOLLOWING_BLOCKS = 2;

// Splits text into visible blocks (one per line, as produced by
// extractVisibleText) and returns the normalized text that identifies the
// promo: each block containing a keyword plus the next couple of blocks
// (terms are often in the paragraph below the heading). Oversized blocks —
// pages without block markup — fall back to a window around the match.
function promoRegions(rawText, keywords, radius) {
  const blocks = rawText
    .split(/\n+/)
    .map((b) => cleanWhitespace(b))
    .filter(Boolean);
  const needles = keywords.map(normalize).filter(Boolean);
  const picked = new Set();
  const windows = [];

  blocks.forEach((block, i) => {
    const norm = normalize(block);
    const hits = needles.map((n) => norm.indexOf(n)).filter((idx) => idx !== -1);
    if (hits.length === 0) return;
    if (block.length > MAX_BLOCK) {
      for (const idx of hits) windows.push({ block: i, start: Math.max(0, idx - radius), end: idx + radius });
      return;
    }
    for (let j = i; j <= Math.min(blocks.length - 1, i + FOLLOWING_BLOCKS); j++) picked.add(j);
  });

  const parts = [...picked].sort((a, b) => a - b).map((i) => blocks[i].slice(0, MAX_BLOCK));
  for (const w of windows) parts.push(blocks[w.block].slice(w.start, w.end));
  return parts;
}

/**
 * Analyzes page text for promo keywords.
 *
 * The fingerprint only covers the blocks around keyword matches, not the whole
 * page — so a rotating banner, a footer date or an unrelated promo doesn't
 * re-trigger notifications, but a change in rate/term/validity next to
 * "compra de saldo" does.
 */
function analyzeText(rawText, keywords, { radius = 180 } = {}) {
  const { original, normalized, map } = buildSearchIndex(rawText);
  const matches = findAllKeywordMatches(normalized, keywords);
  if (matches.length === 0) return null;

  const regions = promoRegions(rawText, keywords, radius);
  const fingerprint = hash(regions.map(normalize).join('\n'));

  const first = matches[0];
  return {
    keyword: first.keyword,
    matchCount: matches.length,
    snippet: extractSnippet(original, map[first.index] ?? 0, radius),
    fingerprint,
    details: extractPromoDetails(regions.join(' ')),
  };
}

// Best-effort extraction of rate and term from the text around the match.
function extractPromoDetails(text) {
  const rates = [...text.matchAll(/(\d{1,2}(?:[.,]\d{1,2})?)\s?%/g)].map((m) => m[1].replace(',', '.'));
  const months = [...text.matchAll(/(\d{1,2})\s?mes(?:es)?/gi)].map((m) => Number(m[1]));
  return {
    rates: [...new Set(rates)],
    months: [...new Set(months)].sort((a, b) => a - b),
  };
}

module.exports = {
  normalize,
  hash,
  findKeywordMatch,
  findAllKeywordMatches,
  extractSnippet,
  analyzeText,
  extractPromoDetails,
};
