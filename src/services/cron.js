const cron = require('node-cron');
const scraperService = require('./scraperService');
const logger = require('../utils/logger');

function startCron() {
  const schedule = process.env.SCRAPE_CRON || '0 */6 * * *';

  if (!cron.validate(schedule)) {
    logger.error(`Invalid SCRAPE_CRON expression "${schedule}" — cron disabled`);
    return;
  }

  cron.schedule(schedule, async () => {
    logger.info('Cron: starting scheduled scrape run');
    try {
      await scraperService.runAll();
    } catch (err) {
      logger.error('Cron scrape run failed:', err.message);
    }
  });

  logger.info(`Scrape cron scheduled: "${schedule}"`);
}

module.exports = { startCron };
