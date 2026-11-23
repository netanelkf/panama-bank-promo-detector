const router = require('express').Router();
const Promotion = require('../models/Promotion');
const authMiddleware = require('../middleware/auth');

// GET /promotions?limit=50&bank=<slug> — history of detected promos
router.get('/', authMiddleware, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const bankSlug = typeof req.query.bank === 'string' ? req.query.bank : undefined;
  const promotions = await Promotion.findRecent({ limit, bankSlug });
  return res.json(promotions);
});

// GET /promotions/latest — most recent promo per bank
router.get('/latest', authMiddleware, async (req, res) => {
  return res.json(await Promotion.findLatestPerBank());
});

module.exports = router;
