const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const Bank = require('../models/Bank');
const MonitoredSource = require('../models/MonitoredSource');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');

// GET /banks — public list of monitored banks
router.get('/', async (req, res) => {
  const banks = await Bank.findActive();
  return res.json(banks);
});

// POST /banks — admin: register a new bank
router.post(
  '/',
  authMiddleware,
  adminMiddleware,
  [body('name').trim().notEmpty(), body('slug').trim().notEmpty(), body('website_url').optional().isURL()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, slug, website_url } = req.body;
    const existing = await Bank.findBySlug(slug);
    if (existing) return res.status(409).json({ error: 'Slug already exists' });

    const bank = await Bank.create({ name, slug, website_url });
    return res.status(201).json(bank);
  }
);

// PATCH /banks/:id — admin: update a bank
router.patch('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const { name, website_url, active } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (website_url !== undefined) updates.website_url = website_url;
  if (active !== undefined) updates.active = Boolean(active);

  const bank = await Bank.update(req.params.id, updates);
  if (!bank) return res.status(404).json({ error: 'Bank not found' });
  return res.json(bank);
});

// DELETE /banks/:id — admin
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  await Bank.remove(req.params.id);
  return res.status(204).send();
});

// GET /banks/:id/sources — admin: list monitored sources for a bank
router.get('/:id/sources', authMiddleware, adminMiddleware, async (req, res) => {
  const sources = await MonitoredSource.findByBank(req.params.id);
  return res.json(sources);
});

// POST /banks/:id/sources — admin: add a monitored URL for a bank
router.post(
  '/:id/sources',
  authMiddleware,
  adminMiddleware,
  [body('url').isURL(), body('keywords').optional().isArray(), body('css_selector').optional().isString()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const bank = await Bank.findById(req.params.id);
    if (!bank) return res.status(404).json({ error: 'Bank not found' });

    const { url, keywords, css_selector } = req.body;
    const source = await MonitoredSource.create({
      bank_id: bank.id,
      url,
      keywords: JSON.stringify(keywords && keywords.length ? keywords : ['compra de saldo']),
      css_selector,
    });
    return res.status(201).json(source);
  }
);

// PATCH /banks/:bankId/sources/:sourceId — admin
router.patch('/:bankId/sources/:sourceId', authMiddleware, adminMiddleware, async (req, res) => {
  const { url, keywords, css_selector, active } = req.body;
  const updates = {};
  if (url !== undefined) updates.url = url;
  if (keywords !== undefined) updates.keywords = JSON.stringify(keywords);
  if (css_selector !== undefined) updates.css_selector = css_selector;
  if (active !== undefined) updates.active = Boolean(active);

  const source = await MonitoredSource.update(req.params.sourceId, updates);
  if (!source) return res.status(404).json({ error: 'Source not found' });
  return res.json(source);
});

// DELETE /banks/:bankId/sources/:sourceId — admin
router.delete('/:bankId/sources/:sourceId', authMiddleware, adminMiddleware, async (req, res) => {
  await MonitoredSource.remove(req.params.sourceId);
  return res.status(204).send();
});

module.exports = router;
