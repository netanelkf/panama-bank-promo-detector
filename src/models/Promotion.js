const db = require('../config/db');

const TABLE = 'promotions';

const Promotion = {
  findRecent: (limit = 50) =>
    db(TABLE)
      .join('banks', 'banks.id', `${TABLE}.bank_id`)
      .orderBy(`${TABLE}.detected_at`, 'desc')
      .limit(limit)
      .select(`${TABLE}.*`, 'banks.name as bank_name', 'banks.slug as bank_slug'),

  findLastForSource: (sourceId) =>
    db(TABLE).where({ source_id: sourceId }).orderBy('detected_at', 'desc').first(),

  create: (data) => db(TABLE).insert(data).returning('*').then((rows) => rows[0]),

  markNotified: (id) => db(TABLE).where({ id }).update({ notified_at: db.fn.now() }),
};

module.exports = Promotion;
