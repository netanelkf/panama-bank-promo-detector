const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const scraperService = require('../services/scraperService');

// POST /admin/scrape/run — manually trigger a scrape of all monitored sources
router.post('/scrape/run', authMiddleware, adminMiddleware, async (req, res) => {
  const promotions = await scraperService.runAll();
  return res.json({ ran_at: new Date().toISOString(), new_promotions: promotions.length, promotions });
});

module.exports = router;
