const crypto = require('crypto');

// Strips accents and lowercases so "Compra de Saldo" matches "compra de saldo"
// regardless of accents/case used on the page.
function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function findKeywordMatch(normalizedText, keywords) {
  for (const keyword of keywords) {
    const normalizedKeyword = normalize(keyword);
    const index = normalizedText.indexOf(normalizedKeyword);
    if (index !== -1) {
      return { keyword, index };
    }
  }
  return null;
}

function extractSnippet(normalizedText, index, radius = 180) {
  const start = Math.max(0, index - radius);
  const end = Math.min(normalizedText.length, index + radius);
  const prefix = start > 0 ? '… ' : '';
  const suffix = end < normalizedText.length ? ' …' : '';
  return prefix + normalizedText.slice(start, end).trim() + suffix;
}

module.exports = { normalize, hash, findKeywordMatch, extractSnippet };
