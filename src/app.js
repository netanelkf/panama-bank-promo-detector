require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const db = require('./config/db');
const logger = require('./utils/logger');

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

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

app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err.message);
  return res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
