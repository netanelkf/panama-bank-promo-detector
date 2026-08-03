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

  findByBank: (bankId) => db(TABLE).where({ bank_id: bankId }),

  findById: (id) => db(TABLE).where({ id }).first(),

  create: (data) => db(TABLE).insert(data).returning('*').then((rows) => rows[0]),

  update: (id, data) => db(TABLE).where({ id }).update(data).returning('*').then((rows) => rows[0]),

  remove: (id) => db(TABLE).where({ id }).del(),
};

module.exports = MonitoredSource;
