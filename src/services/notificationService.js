const nodemailer = require('nodemailer');
const { Expo } = require('expo-server-sdk');
const User = require('../models/User');
const Promotion = require('../models/Promotion');
const logger = require('../utils/logger');

const expo = new Expo();

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendEmail(to, subject, text) {
  if (!process.env.SMTP_HOST) {
    logger.warn('SMTP not configured — skipping email to', to);
    return;
  }
  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"Promos Bancarias PA" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
    });
    logger.info('Email sent to', to);
  } catch (err) {
    logger.error('Email send failed:', err.message);
  }
}

async function sendPushNotification(expoPushToken, title, body) {
  if (!Expo.isExpoPushToken(expoPushToken)) {
    logger.warn('Invalid Expo push token:', expoPushToken);
    return;
  }
  try {
    const chunks = expo.chunkPushNotifications([{ to: expoPushToken, title, body, sound: 'default' }]);
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
    logger.info('Push notification sent to', expoPushToken);
  } catch (err) {
    logger.error('Push notification failed:', err.message);
  }
}

async function notifySubscribersOfPromotion(promotion, bank) {
  const users = await User.findSubscribed();
  if (users.length === 0) {
    logger.info('No subscribed users to notify');
    return;
  }

  const subject = `${bank.name} está comprando saldo de tarjeta de crédito`;
  const body =
    `${bank.name} está promocionando compra de saldo de tarjeta de crédito.\n\n` +
    `Detalle detectado:\n"${promotion.snippet}"\n\n` +
    `Instrucciones: visita el enlace oficial del banco para ver la promoción completa y aplicar:\n${promotion.url}\n\n` +
    (bank.website_url ? `Sitio del banco: ${bank.website_url}\n\n` : '') +
    `Este es un aviso automático — verifica siempre las tasas y condiciones directamente con el banco antes de tomar una decisión.`;

  const pushTitle = `💳 ${bank.name}: compra de saldo`;
  const pushBody = promotion.snippet.slice(0, 140);

  const tasks = [];
  for (const user of users) {
    if (user.email) tasks.push(sendEmail(user.email, subject, body));
    if (user.expo_push_token) tasks.push(sendPushNotification(user.expo_push_token, pushTitle, pushBody));
  }

  await Promise.allSettled(tasks);
  await Promotion.markNotified(promotion.id);
  logger.info(`Notified ${users.length} subscribed user(s) about promotion ${promotion.id}`);
}

module.exports = { notifySubscribersOfPromotion };
