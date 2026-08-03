exports.up = (knex) =>
  knex.schema.createTable('promotions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('bank_id').notNullable().references('id').inTable('banks').onDelete('CASCADE');
    t.uuid('source_id').notNullable().references('id').inTable('monitored_sources').onDelete('CASCADE');
    t.string('matched_keyword', 255);
    t.text('snippet');
    t.string('url', 500);
    t.string('content_hash', 64).notNullable();
    t.timestamp('detected_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('notified_at');
    t.timestamps(true, true);
  });

exports.down = (knex) => knex.schema.dropTable('promotions');
