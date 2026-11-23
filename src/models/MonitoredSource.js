const db = require('../config/db');

const TABLE = 'monitored_sources';

const MonitoredSource = {
  findAllActiveWithBank: () =>
    db(TABLE)
      .join('banks', 'banks.id', `${TABLE}.bank_id`)
      .where(`${TABLE}.active`, true)
      .andWhere('banks.active', true)
      .select(
        `${TABLE}.*`,
        'banks.name as bank_name',
        'banks.slug as bank_slug',
        'banks.website_url as bank_website_url'
      ),

  findHealth: () =>
    db(TABLE)
      .join('banks', 'banks.id', `${TABLE}.bank_id`)
      .select(
        `${TABLE}.id`,
        `${TABLE}.url`,
        `${TABLE}.active`,
        `${TABLE}.last_checked_at`,
        `${TABLE}.last_success_at`,
        `${TABLE}.last_status_code`,
        `${TABLE}.last_error`,
        `${TABLE}.consecutive_failures`,
        'banks.name as bank_name'
      )
      .orderBy(`${TABLE}.consecutive_failures`, 'desc')
      .orderBy('banks.name'),

  findByBank: (bankId) => db(TABLE).where({ bank_id: bankId }),

  findById: (id) => db(TABLE).where({ id }).first(),

  create: (data) => db(TABLE).insert(data).returning('*').then((rows) => rows[0]),

  update: (id, data) =>
    db(TABLE)
      .where({ id })
      .update({ ...data, updated_at: db.fn.now() })
      .returning('*')
      .then((rows) => rows[0]),

  recordSuccess: (id, statusCode) =>
    db(TABLE).where({ id }).update({
      last_checked_at: db.fn.now(),
      last_success_at: db.fn.now(),
      last_status_code: statusCode,
      last_error: null,
      consecutive_failures: 0,
    }),

  recordFailure: (id, statusCode, error) =>
    db(TABLE)
      .where({ id })
      .update({
        last_checked_at: db.fn.now(),
        last_status_code: statusCode,
        last_error: String(error).slice(0, 1000),
        consecutive_failures: db.raw('consecutive_failures + 1'),
      }),

  remove: (id) => db(TABLE).where({ id }).del(),
};

module.exports = MonitoredSource;
