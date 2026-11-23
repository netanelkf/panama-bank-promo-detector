require('dotenv').config();
const scraperService = require('../services/scraperService');
const db = require('../config/db');

(async () => {
  let exitCode = 0;
  try {
    const summary = await scraperService.runAll();
    console.log(
      `Done. ${summary.checked} checked, ${summary.errors} error(s), ${summary.promotions.length} new promotion(s).`
    );
  } catch (err) {
    console.error('Scrape run failed:', err);
    exitCode = 1;
  } finally {
    await db.destroy();
  }
  process.exit(exitCode);
})();
