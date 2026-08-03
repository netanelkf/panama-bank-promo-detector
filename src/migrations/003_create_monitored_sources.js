exports.up = (knex) =>
  knex.schema.createTable('monitored_sources', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('bank_id').notNullable().references('id').inTable('banks').onDelete('CASCADE');
    t.string('url', 500).notNullable();
    // CSS selector to scope scraping to (e.g. 'main'); null = whole page body
    t.string('css_selector', 255);
    // Keywords/phrases that indicate a "compra de saldo" promo is present
    t.jsonb('keywords').notNullable().defaultTo(JSON.stringify(['compra de saldo']));
    // Hash of the normalized text the last time a keyword match was found —
    // used to avoid re-notifying for a promo that hasn't actually changed.
    t.string('last_matched_hash', 64);
    t.timestamp('last_checked_at');
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamps(true, true);
  });

exports.down = (knex) => knex.schema.dropTable('monitored_sources');
