// Tracks scrape health per source (so broken/blocked URLs are visible instead
// of silently failing) and stores extracted promo details.
exports.up = async (knex) => {
  await knex.schema.alterTable('monitored_sources', (t) => {
    t.integer('last_status_code');
    t.text('last_error');
    t.integer('consecutive_failures').notNullable().defaultTo(0);
    t.timestamp('last_success_at');
    // The fingerprint algorithm changed (whole page -> text around matches).
    // Sources that already have a hash get re-baselined silently on the next
    // run instead of re-notifying every user about promos they already saw.
    t.boolean('rebaseline').notNullable().defaultTo(false);
  });
  await knex('monitored_sources').whereNotNull('last_matched_hash').update({ rebaseline: true });
  await knex.schema.alterTable('promotions', (t) => {
    t.jsonb('details');
    t.index(['detected_at']);
  });
};

exports.down = async (knex) => {
  await knex.schema.alterTable('promotions', (t) => {
    t.dropIndex(['detected_at']);
    t.dropColumn('details');
  });
  await knex.schema.alterTable('monitored_sources', (t) => {
    t.dropColumn('last_status_code');
    t.dropColumn('last_error');
    t.dropColumn('consecutive_failures');
    t.dropColumn('last_success_at');
    t.dropColumn('rebaseline');
  });
};
