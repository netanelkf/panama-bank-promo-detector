const router = require('express').Router();
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const scraperService = require('../services/scraperService');
const MonitoredSource = require('../models/MonitoredSource');
const logger = require('../utils/logger');

router.use(authMiddleware, adminMiddleware);

// POST /admin/scrape/run — trigger a scrape of all sources in the background.
// A full run takes minutes (sequential fetches + notifications), longer than
// typical proxy/client timeouts, so we don't hold the request open.
router.post('/scrape/run', (req, res) => {
  if (scraperService.isRunning()) return res.status(409).json({ error: 'A scrape run is already in progress' });
  scraperService.runAll().catch((err) => logger.error('Manual scrape run failed:', err.message));
  return res.status(202).json({ started_at: new Date().toISOString() });
});

// GET /admin/sources/health — which sources are failing (403, 404, timeouts…)
router.get('/sources/health', async (req, res) => {
  const sources = await MonitoredSource.findHealth();
  return res.json({
    scrape_running: scraperService.isRunning(),
    failing: sources.filter((s) => s.consecutive_failures > 0).length,
    total: sources.length,
    sources,
  });
});

module.exports = router;
