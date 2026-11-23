const nodemailer = require('nodemailer');
const { Expo } = require('expo-server-sdk');
const User = require('../models/User');
const Promotion = require('../models/Promotion');
const logger = require('../utils/logger');

const expo = new Expo();
const EMAIL_CONCURRENCY = 5;

let transporter = null;
function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      pool: true,
      maxConnections: EMAIL_CONCURRENCY,
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

async function sendEmail(to, subject, text) {
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || `"Promos Bancarias PA" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
  });
}

// Runs `fn` over `items` with at most `limit` in flight — avoids hammering
// the SMTP provider (Gmail throttles/blocks bursts).
async function mapWithConcurrency(items, limit, fn) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try {
        results[idx] = { ok: true, value: await fn(items[idx]) };
      } catch (err) {
        results[idx] = { ok: false, error: err };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function sendPushBatch(users, title, body, data) {
  const valid = users.filter((u) => Expo.isExpoPushToken(u.expo_push_token));
  const messages = valid.map((u) => ({ to: u.expo_push_token, title, body, sound: 'default', data }));
  let sent = 0;
  for (const chunk of expo.chunkPushNotifications(messages)) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket, idx) => {
        if (ticket.status === 'ok') {
          sent++;
          return;
        }
        // Token is dead (app uninstalled / permissions revoked) — stop sending to it.
        if (ticket.details?.error === 'DeviceNotRegistered') {
          User.clearPushToken(chunk[idx].to).catch(() => {});
        }
        logger.warn('Push ticket error:', ticket.message);
      });
    } catch (err) {
      logger.error('Push batch failed:', err.message);
    }
  }
  return sent;
}

function formatDetails(details) {
  if (!details) return '';
  const parts = [];
  if (details.rates?.length) parts.push(`tasa(s) mencionada(s): ${details.rates.map((r) => r + '%').join(', ')}`);
  if (details.months?.length) parts.push(`plazo(s): ${details.months.join(', ')} meses`);
  return parts.join(' · ');
}

async function notifySubscribersOfPromotion(promotion, bank) {
  const users = await User.findSubscribed();
  if (users.length === 0) {
    logger.info('No subscribed users to notify');
    return;
  }

  const details = typeof promotion.details === 'string' ? JSON.parse(promotion.details) : promotion.details;
  const detailLine = formatDetails(details);

  const subject = `${bank.name}: promoción de compra de saldo`;
  const body =
    `${bank.name} está promocionando compra de saldo de tarjeta de crédito.\n\n` +
    (detailLine ? `${detailLine}\n\n` : '') +
    `Detalle detectado:\n"${promotion.snippet}"\n\n` +
    `Ver la promoción completa y aplicar:\n${promotion.url}\n\n` +
    `Aviso automático: verifica tasas y condiciones directamente con el banco antes de decidir.\n` +
    `Para dejar de recibir estos avisos, desactiva las notificaciones en tu cuenta.`;

  const pushTitle = `💳 ${bank.name}: compra de saldo`;
  const pushBody = (detailLine || promotion.snippet).slice(0, 140);

  let emailsSent = 0;
  if (process.env.SMTP_HOST) {
    const recipients = users.filter((u) => u.email);
    const results = await mapWithConcurrency(recipients, EMAIL_CONCURRENCY, (u) => sendEmail(u.email, subject, body));
    results.forEach((r, idx) => {
      if (r.ok) emailsSent++;
      else logger.error(`Email to ${recipients[idx].email} failed:`, r.error.message);
    });
  } else {
    logger.warn('SMTP not configured — skipping emails');
  }

  const pushSent = await sendPushBatch(
    users.filter((u) => u.expo_push_token),
    pushTitle,
    pushBody,
    { promotionId: promotion.id, url: promotion.url }
  );

  await Promotion.markNotified(promotion.id);
  logger.info(`Promotion ${promotion.id}: ${emailsSent} email(s), ${pushSent} push(es) sent to ${users.length} subscriber(s)`);
}

module.exports = { notifySubscribersOfPromotion, mapWithConcurrency, formatDetails };
