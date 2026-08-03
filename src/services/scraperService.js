const axios = require('axios');
const cheerio = require('cheerio');
const MonitoredSource = require('../models/MonitoredSource');
const Promotion = require('../models/Promotion');
const logger = require('../utils/logger');
const { normalize, hash, findKeywordMatch, extractSnippet } = require('../utils/textMatch');
const { notifySubscribersOfPromotion } = require('./notificationService');

const REQUEST_TIMEOUT_MS = 15000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; PanamaBankPromoDetector/1.0; +https://github.com/netanelkf/panama-bank-promo-detector)';

async function checkSource(source) {
  let html;
  try {
    const response = await axios.get(source.url, {
      timeout: REQUEST_TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'es-PA,es;q=0.9' },
    });
    html = response.data;
  } catch (err) {
    const status = err.response?.status;
    logger.warn(
      `Scrape failed for ${source.bank_name} (${source.url}):`,
      status ? `HTTP ${status}` : err.message
    );
    return null;
  }

  const $ = cheerio.load(html);
  const scope = source.css_selector ? $(source.css_selector) : $('body');
  const rawText = scope.length ? scope.text() : $('body').text();
  const normalizedText = normalize(rawText);

  const keywords = Array.isArray(source.keywords) ? source.keywords : [];
  const match = findKeywordMatch(normalizedText, keywords);

  await MonitoredSource.update(source.id, { last_checked_at: new Date() });

  if (!match) return null;

  const contentHash = hash(normalizedText);
  if (contentHash === source.last_matched_hash) {
    // Same promo content as last time we matched — nothing new to notify.
    return null;
  }

  const snippet = extractSnippet(normalizedText, match.index);

  const promotion = await Promotion.create({
    bank_id: source.bank_id,
    source_id: source.id,
    matched_keyword: match.keyword,
    snippet,
    url: source.url,
    content_hash: contentHash,
  });

  await MonitoredSource.update(source.id, { last_matched_hash: contentHash });

  logger.info(`New promo detected for ${source.bank_name}: "${match.keyword}"`);

  await notifySubscribersOfPromotion(promotion, {
    id: source.bank_id,
    name: source.bank_name,
    slug: source.bank_slug,
    website_url: source.bank_website_url,
  });

  return promotion;
}

async function runAll() {
  const sources = await MonitoredSource.findAllActiveWithBank();
  logger.info(`Running scrape over ${sources.length} monitored source(s)`);

  const results = [];
  for (const source of sources) {
    try {
      const promotion = await checkSource(source);
      if (promotion) results.push(promotion);
    } catch (err) {
      logger.error(`Unexpected error scraping ${source.url}:`, err.message);
    }
  }
  return results;
}

module.exports = { checkSource, runAll };
