const db = require('../config/db');

const TABLE = 'banks';

const Bank = {
  findAll: () => db(TABLE).orderBy('name'),

  findActive: () => db(TABLE).where({ active: true }).orderBy('name'),

  findById: (id) => db(TABLE).where({ id }).first(),

  findBySlug: (slug) => db(TABLE).where({ slug }).first(),

  create: (data) => db(TABLE).insert(data).returning('*').then((rows) => rows[0]),

  update: (id, data) => db(TABLE).where({ id }).update(data).returning('*').then((rows) => rows[0]),

  remove: (id) => db(TABLE).where({ id }).del(),
};

module.exports = Bank;
