const app = require('./src/app');
const { startCron } = require('./src/services/cron');

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Server running on port ' + port));

startCron();
