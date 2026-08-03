// Seed data based on real, verified promo pages found for major Panamanian
// banks (August 2026). URLs/selectors may need adjusting over time as banks
// redesign their sites — that's expected, tune via the /banks admin API.
const BANKS = [
  {
    name: 'Banco General',
    slug: 'banco-general',
    website_url: 'https://www.bgeneral.com',
    source: {
      url: 'https://www.bgeneral.com/personas/promociones/',
      keywords: ['compra de saldo', 'compra el saldo de tu tarjeta'],
    },
  },
  {
    name: 'BAC Credomatic',
    slug: 'bac',
    website_url: 'https://www.baccredomatic.com/es-pa',
    source: {
      url: 'https://www.baccredomatic.com/es-pa/personas/landing/compra-de-saldo',
      keywords: ['compra de saldo'],
    },
  },
  {
    name: 'Banistmo',
    slug: 'banistmo',
    website_url: 'https://www.banistmo.com',
    source: {
      url: 'https://www.banistmo.com/personas/promociones',
      keywords: ['compra de saldo', 'compra tu saldo'],
    },
  },
  {
    name: 'Global Bank',
    slug: 'global-bank',
    website_url: 'https://www.globalbank.com.pa',
    source: {
      url: 'https://www.globalbank.com.pa/promociones',
      keywords: ['compra de saldo'],
    },
  },
  {
    name: 'Banesco',
    slug: 'banesco',
    website_url: 'https://www.banesco.com.pa',
    source: {
      url: 'https://www.banesco.com.pa/promociones/quitate-un-peso-de-encima/',
      keywords: ['compra de saldo', 'compramos tu saldo', 'quitate un peso de encima'],
    },
  },
  {
    name: 'Caja de Ahorros',
    slug: 'caja-de-ahorros',
    website_url: 'https://www.cajadeahorros.com.pa',
    source: {
      url: 'https://www.cajadeahorros.com.pa/promocion/compramos-tu-saldo/',
      keywords: ['compra de saldo', 'compramos tu saldo'],
    },
  },
  {
    name: 'Multibank',
    slug: 'multibank',
    website_url: 'https://www.multibank.com.pa',
    source: {
      url: 'https://www.multibank.com.pa/es/personas/compra-de-saldo',
      keywords: ['compra de saldo'],
    },
  },
];

exports.seed = async function (knex) {
  await knex('promotions').del();
  await knex('monitored_sources').del();
  await knex('banks').del();

  for (const entry of BANKS) {
    const [bank] = await knex('banks')
      .insert({ name: entry.name, slug: entry.slug, website_url: entry.website_url })
      .returning('*');

    await knex('monitored_sources').insert({
      bank_id: bank.id,
      url: entry.source.url,
      keywords: JSON.stringify(entry.source.keywords),
    });
  }
};
