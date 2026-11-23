const axios = require('axios');
const cheerio = require('cheerio');
const MonitoredSource = require('../models/MonitoredSource');
const Promotion = require('../models/Promotion');
const logger = require('../utils/logger');
const { analyzeText } = require('../utils/textMatch');
const { notifySubscribersOfPromotion } = require('./notificationService');

const REQUEST_TIMEOUT_MS = 20000;
const MAX_ATTEMPTS = 2;
// Browser-like headers: several Panamanian bank sites sit behind WAFs that
// reject obvious bot user agents.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-PA,es;q=0.9,en;q=0.5',
};

// Elements whose text is never visible promo content. Without removing these,
// inline JS/JSON (build hashes, nonces, tracking config) changes on every
// deploy of the bank's site and pollutes matching.
const NON_CONTENT = 'script, style, noscript, template, svg, iframe, head';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await axios.get(url, {
        timeout: REQUEST_TIMEOUT_MS,
        headers: HEADERS,
        maxContentLength: 10 * 1024 * 1024,
        responseType: 'text',
      });
      return { html: res.data, status: res.status };
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      // 4xx (except 429) won't fix itself on retry.
      if (status && status >= 400 && status < 500 && status !== 429) break;
      if (attempt < MAX_ATTEMPTS) await sleep(2000 * attempt);
    }
  }
  throw lastErr;
}

function extractVisibleText(html, cssSelector) {
  const $ = cheerio.load(html);
  $(NON_CONTENT).remove();
  // Newline after block elements: keeps words from adjacent tags apart and
  // lets the matcher reason about blocks (paragraphs, cards, list items).
  $('br, p, div, li, h1, h2, h3, h4, h5, h6, td, th, tr, section, article, header, footer, nav, main, aside').append('\n');
  const scope = cssSelector ? $(cssSelector) : $('body');
  return scope.length ? scope.text() : $('body').text();
}

async function checkSource(source) {
  let html;
  let status;
  try {
    ({ html, status } = await fetchHtml(source.url));
  } catch (err) {
    const code = err.response?.status ?? null;
    const message = code ? `HTTP ${code}` : err.message;
    logger.warn(`Scrape failed for ${source.bank_name} (${source.url}): ${message}`);
    await MonitoredSource.recordFailure(source.id, code, message);
    return { status: 'error', error: message };
  }

  const keywords = Array.isArray(source.keywords) ? source.keywords : [];
  const analysis = analyzeText(extractVisibleText(html, source.css_selector), keywords);

  await MonitoredSource.recordSuccess(source.id, status);

  if (!analysis) return { status: 'no_match' };

  if (analysis.fingerprint === source.last_matched_hash) return { status: 'unchanged' };

  if (source.rebaseline) {
    await MonitoredSource.update(source.id, { last_matched_hash: analysis.fingerprint, rebaseline: false });
    logger.info(`Re-baselined ${source.bank_name} without notifying`);
    return { status: 'rebaselined' };
  }

  const promotion = await Promotion.create({
    bank_id: source.bank_id,
    source_id: source.id,
    matched_keyword: analysis.keyword,
    snippet: analysis.snippet,
    url: source.url,
    content_hash: analysis.fingerprint,
    details: JSON.stringify(analysis.details),
  });

  await MonitoredSource.update(source.id, { last_matched_hash: analysis.fingerprint });

  logger.info(`New promo detected for ${source.bank_name}: "${analysis.keyword}"`);

  await notifySubscribersOfPromotion(promotion, {
    id: source.bank_id,
    name: source.bank_name,
    slug: source.bank_slug,
    website_url: source.bank_website_url,
  });

  return { status: 'new_promotion', promotion };
}

// Prevents the cron and a manual /admin/scrape/run from overlapping and
// sending duplicate notifications.
let running = null;

function isRunning() {
  return running !== null;
}

async function runAll() {
  if (running) {
    const err = new Error('A scrape run is already in progress');
    err.code = 'SCRAPE_IN_PROGRESS';
    throw err;
  }
  running = (async () => {
    const sources = await MonitoredSource.findAllActiveWithBank();
    logger.info(`Running scrape over ${sources.length} monitored source(s)`);

    const summary = { checked: 0, errors: 0, promotions: [] };
    for (const source of sources) {
      summary.checked++;
      try {
        const result = await checkSource(source);
        if (result.status === 'error') summary.errors++;
        if (result.promotion) summary.promotions.push(result.promotion);
      } catch (err) {
        summary.errors++;
        logger.error(`Unexpected error scraping ${source.url}:`, err.message);
      }
    }
    logger.info(
      `Scrape done: ${summary.checked} checked, ${summary.errors} errors, ${summary.promotions.length} new promo(s)`
    );
    return summary;
  })();
  try {
    return await running;
  } finally {
    running = null;
  }
}

module.exports = { checkSource, runAll, isRunning, extractVisibleText };
