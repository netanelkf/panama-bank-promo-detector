require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const db = require('./config/db');
const logger = require('./utils/logger');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set and at least 32 characters long');
}

const app = express();
// Behind Render's proxy: needed so rate limiting sees the real client IP.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '100kb' }));

app.use('/auth', require('./routes/auth'));
app.use('/banks', require('./routes/banks'));
app.use('/promotions', require('./routes/promotions'));
app.use('/admin', require('./routes/admin'));

app.get('/', (req, res) => res.send('Panama Bank Promo Detector backend running'));

app.get('/health', async (req, res) => {
  let dbStatus = 'ok';
  try {
    await db.raw('SELECT 1');
  } catch {
    dbStatus = 'error';
  }
  return res.json({ status: 'ok', db: dbStatus, timestamp: new Date().toISOString() });
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Express 5 forwards rejected promises from async handlers here.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  logger.error('Unhandled error:', err.stack || err.message);
  return res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
