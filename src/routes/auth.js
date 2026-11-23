const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const rateLimit = require('express-rate-limit');
const authMiddleware = require('../middleware/auth');

// Brute-force protection for credential endpoints.
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts, try again later' },
});

function signToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
}

function safeUser(user) {
  const { password_hash, ...safe } = user;
  return safe;
}

// POST /auth/register
router.post(
  '/register',
  credentialLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8, max: 72 }),
    body('name').optional().trim().notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password, name } = req.body;

    const existing = await User.findByEmail(email);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password_hash, name, subscribed: true });

    const token = signToken(user);
    return res.status(201).json({ token, user: safeUser(user) });
  }
);

// POST /auth/login
router.post(
  '/login',
  credentialLimiter,
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    const user = await User.findByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(user);
    return res.json({ token, user: safeUser(user) });
  }
);

// GET /auth/me
router.get('/me', authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json(safeUser(user));
});

// PATCH /auth/me — update name, push token, subscription status
router.patch(
  '/me',
  authMiddleware,
  [
    body('name').optional().isString().trim().isLength({ max: 255 }),
    body('expo_push_token').optional({ values: 'null' }).isString().isLength({ max: 255 }),
    body('subscribed').optional().isBoolean().toBoolean(true),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, expo_push_token, subscribed } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (expo_push_token !== undefined) updates.expo_push_token = expo_push_token;
    if (subscribed !== undefined) updates.subscribed = subscribed;
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update' });

    const user = await User.update(req.user.userId, updates);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json(safeUser(user));
  }
);

module.exports = router;
