const db = require('../config/db');

const TABLE = 'users';

const User = {
  findById: (id) => db(TABLE).where({ id }).first(),

  findByEmail: (email) => db(TABLE).whereRaw('lower(email) = lower(?)', [email]).first(),

  findSubscribed: () => db(TABLE).where({ subscribed: true }),

  create: (data) => db(TABLE).insert(data).returning('*').then((rows) => rows[0]),

  update: (id, data) =>
    db(TABLE)
      .where({ id })
      .update({ ...data, updated_at: db.fn.now() })
      .returning('*')
      .then((rows) => rows[0]),

  clearPushToken: (token) => db(TABLE).where({ expo_push_token: token }).update({ expo_push_token: null }),
};

module.exports = User;
