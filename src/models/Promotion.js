const db = require('../config/db');

const TABLE = 'promotions';

const Promotion = {
  findRecent: ({ limit = 50, bankSlug } = {}) => {
    const q = db(TABLE)
      .join('banks', 'banks.id', `${TABLE}.bank_id`)
      .orderBy(`${TABLE}.detected_at`, 'desc')
      .limit(limit)
      .select(`${TABLE}.*`, 'banks.name as bank_name', 'banks.slug as bank_slug');
    if (bankSlug) q.where('banks.slug', bankSlug);
    return q;
  },

  // Most recent promotion per bank — "what's on offer right now".
  findLatestPerBank: () =>
    db
      .select('*')
      .from(
        db(TABLE)
          .join('banks', 'banks.id', `${TABLE}.bank_id`)
          .where('banks.active', true)
          .distinctOn(`${TABLE}.bank_id`)
          .orderBy([
            { column: `${TABLE}.bank_id` },
            { column: `${TABLE}.detected_at`, order: 'desc' },
          ])
          .select(`${TABLE}.*`, 'banks.name as bank_name', 'banks.slug as bank_slug')
          .as('latest')
      )
      .orderBy('detected_at', 'desc'),

  findLastForSource: (sourceId) =>
    db(TABLE).where({ source_id: sourceId }).orderBy('detected_at', 'desc').first(),

  create: (data) => db(TABLE).insert(data).returning('*').then((rows) => rows[0]),

  markNotified: (id) => db(TABLE).where({ id }).update({ notified_at: db.fn.now() }),
};

module.exports = Promotion;
