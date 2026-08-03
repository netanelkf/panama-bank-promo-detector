require('dotenv').config();
const scraperService = require('../services/scraperService');
const db = require('../config/db');

(async () => {
  const promotions = await scraperService.runAll();
  console.log(`Done. ${promotions.length} new promotion(s) detected.`);
  await db.destroy();
})();
