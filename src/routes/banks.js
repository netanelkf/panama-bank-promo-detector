const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const Bank = require('../models/Bank');
const MonitoredSource = require('../models/MonitoredSource');
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Malformed ids would otherwise reach Postgres and surface as a 500.
for (const param of ['id', 'bankId', 'sourceId']) {
  router.param(param, (req, res, next, value) =>
    UUID_RE.test(value) ? next() : res.status(404).json({ error: 'Not found' })
  );
}

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  return next();
}

const admin = [authMiddleware, adminMiddleware];

// GET /banks — public list of monitored banks
router.get('/', async (req, res) => {
  return res.json(await Bank.findActive());
});

// POST /banks — admin: register a new bank
router.post(
  '/',
  admin,
  [body('name').trim().notEmpty(), body('slug').trim().notEmpty(), body('website_url').optional().isURL()],
  validate,
  async (req, res) => {
    const { name, slug, website_url } = req.body;
    if (await Bank.findBySlug(slug)) return res.status(409).json({ error: 'Slug already exists' });
    return res.status(201).json(await Bank.create({ name, slug, website_url }));
  }
);

// PATCH /banks/:id — admin: update a bank
router.patch(
  '/:id',
  admin,
  [body('name').optional().trim().notEmpty(), body('website_url').optional().isURL(), body('active').optional().isBoolean().toBoolean(true)],
  validate,
  async (req, res) => {
    const { name, website_url, active } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (website_url !== undefined) updates.website_url = website_url;
    if (active !== undefined) updates.active = active;
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update' });

    const bank = await Bank.update(req.params.id, updates);
    if (!bank) return res.status(404).json({ error: 'Bank not found' });
    return res.json(bank);
  }
);

// DELETE /banks/:id — admin
router.delete('/:id', admin, async (req, res) => {
  await Bank.remove(req.params.id);
  return res.status(204).send();
});

// GET /banks/:id/sources — admin: list monitored sources for a bank
router.get('/:id/sources', admin, async (req, res) => {
  return res.json(await MonitoredSource.findByBank(req.params.id));
});

// POST /banks/:id/sources — admin: add a monitored URL for a bank
router.post(
  '/:id/sources',
  admin,
  [body('url').isURL(), body('keywords').optional().isArray(), body('css_selector').optional().isString()],
  validate,
  async (req, res) => {
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

async function loadSource(req, res, next) {
  const source = await MonitoredSource.findById(req.params.sourceId);
  if (!source || source.bank_id !== req.params.bankId) return res.status(404).json({ error: 'Source not found' });
  req.source = source;
  return next();
}

// PATCH /banks/:bankId/sources/:sourceId — admin
router.patch(
  '/:bankId/sources/:sourceId',
  admin,
  [
    body('url').optional().isURL(),
    body('keywords').optional().isArray({ min: 1 }),
    body('css_selector').optional({ values: 'null' }).isString(),
    body('active').optional().isBoolean().toBoolean(true),
  ],
  validate,
  loadSource,
  async (req, res) => {
    const { url, keywords, css_selector, active } = req.body;
    const updates = {};
    if (url !== undefined) updates.url = url;
    if (keywords !== undefined) updates.keywords = JSON.stringify(keywords);
    if (css_selector !== undefined) updates.css_selector = css_selector;
    if (active !== undefined) updates.active = active;
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update' });

    return res.json(await MonitoredSource.update(req.source.id, updates));
  }
);

// DELETE /banks/:bankId/sources/:sourceId — admin
router.delete('/:bankId/sources/:sourceId', admin, loadSource, async (req, res) => {
  await MonitoredSource.remove(req.source.id);
  return res.status(204).send();
});

module.exports = router;
