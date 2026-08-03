exports.up = (knex) =>
  knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('email', 255).notNullable().unique();
    t.string('password_hash', 255).notNullable();
    t.string('name', 255);
    t.string('role', 20).notNullable().defaultTo('user'); // 'user' | 'admin'
    t.boolean('subscribed').notNullable().defaultTo(true);
    t.string('expo_push_token', 255);
    t.timestamps(true, true);
  });

exports.down = (knex) => knex.schema.dropTable('users');
