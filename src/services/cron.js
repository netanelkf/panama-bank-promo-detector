const cron = require('node-cron');
const scraperService = require('./scraperService');
const logger = require('../utils/logger');

function startCron() {
  const schedule = process.env.SCRAPE_CRON || '0 */6 * * *';
  const timezone = process.env.SCRAPE_TZ || 'America/Panama';

  if (!cron.validate(schedule)) {
    logger.error(`Invalid SCRAPE_CRON expression "${schedule}" — cron disabled`);
    return;
  }

  cron.schedule(
    schedule,
    async () => {
      if (scraperService.isRunning()) {
        logger.warn('Cron: previous scrape still running — skipping this tick');
        return;
      }
      logger.info('Cron: starting scheduled scrape run');
      try {
        await scraperService.runAll();
      } catch (err) {
        logger.error('Cron scrape run failed:', err.message);
      }
    },
    { timezone }
  );

  logger.info(`Scrape cron scheduled: "${schedule}" (${timezone})`);
}

module.exports = { startCron };
