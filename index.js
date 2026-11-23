const app = require('./src/app');
const { startCron } = require('./src/services/cron');

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Server running on port ' + port));

// Set RUN_CRON=false when scraping is driven by an external scheduler
// (e.g. a Render cron job running `npm run scrape`).
if (process.env.RUN_CRON !== 'false') startCron();
