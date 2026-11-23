const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize, analyzeText, extractPromoDetails } = require('../src/utils/textMatch');
const { extractVisibleText } = require('../src/services/scraperService');

test('normalize strips accents, case and extra whitespace', () => {
  assert.equal(normalize('  Compra   de SALDO  Tarjeta Crédito '), 'compra de saldo tarjeta credito');
});

test('analyzeText returns null when no keyword is present', () => {
  assert.equal(analyzeText('Préstamos personales y cuentas de ahorro', ['compra de saldo']), null);
});

test('analyzeText matches accented/cased keywords and keeps readable snippet', () => {
  const r = analyzeText('Promoción: COMPRA DE SALDO al 0% por 12 meses', ['compra de saldo']);
  assert.ok(r);
  assert.match(r.snippet, /COMPRA DE SALDO al 0% por 12 meses/);
  assert.deepEqual(r.details, { rates: ['0'], months: [12] });
});

test('fingerprint ignores changes in unrelated blocks', () => {
  const page = (banner, footer) => `
    <html><body><script>var build="${banner}"</script>
      <div class="hero">${banner}</div>
      <section><h2>Compra de saldo</h2><p>Tasa de 9.99% a 24 meses.</p><p>Aplican condiciones.</p></section>
      <section><h2>Préstamo de auto</h2><p>Otra promo</p></section>
      <footer>© ${footer} — visitas: ${footer}</footer>
    </body></html>`;
  const a = analyzeText(extractVisibleText(page('Banner A', 2025)), ['compra de saldo']);
  const b = analyzeText(extractVisibleText(page('Black Friday!', 2026)), ['compra de saldo']);
  assert.equal(a.fingerprint, b.fingerprint);
  assert.deepEqual(a.details, { rates: ['9.99'], months: [24] });
});

test('long unstructured text falls back to a window around the match', () => {
  const filler = ' lorem'.repeat(200);
  const a = analyzeText(`Banner A${filler} Compra de saldo al 5%.${filler} 2025`, ['compra de saldo']);
  const b = analyzeText(`Banner B${filler} Compra de saldo al 5%.${filler} 2026`, ['compra de saldo']);
  assert.equal(a.fingerprint, b.fingerprint);
});

test('fingerprint changes when promo terms change', () => {
  const a = analyzeText('Compra de saldo con tasa de 9.99% a 24 meses.', ['compra de saldo']);
  const b = analyzeText('Compra de saldo con tasa de 7.99% a 36 meses.', ['compra de saldo']);
  assert.notEqual(a.fingerprint, b.fingerprint);
});

test('extractPromoDetails parses comma decimals and dedupes', () => {
  assert.deepEqual(extractPromoDetails('tasa 1,5% mensual, 1,5 % , 6 meses o 12 meses'), {
    rates: ['1.5'],
    months: [6, 12],
  });
});

test('extractVisibleText ignores scripts/styles and separates block elements', () => {
  const html = `<html><head><title>x</title></head><body>
    <script>var cfg = {"compra de saldo": "build-123"}</script>
    <style>.a{}</style><div>Compra</div><div>de saldo</div></body></html>`;
  const text = normalize(extractVisibleText(html));
  assert.match(extractVisibleText(html), /Compra\s*\n\s*de saldo/);
  assert.equal(text, 'compra de saldo');
  assert.doesNotMatch(text, /build-123/);
});
