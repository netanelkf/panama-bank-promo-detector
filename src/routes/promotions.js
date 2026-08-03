const router = require('express').Router();
const Promotion = require('../models/Promotion');
const authMiddleware = require('../middleware/auth');

// GET /promotions — subscribed users can see recently detected promos
router.get('/', authMiddleware, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const promotions = await Promotion.findRecent(limit);
  return res.json(promotions);
});

module.exports = router;
