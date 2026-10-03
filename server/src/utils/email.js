const nodemailer = require('nodemailer');

// Uses real SMTP when SMTP_HOST is set; otherwise just logs the email,
// so everything works in development without an email account.
let transporter;
function getTransporter() {
  if (transporter) return transporter;
  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  } else {
    transporter = nodemailer.createTransport({ jsonTransport: true });
  }
  return transporter;
}

const devMode = () => !process.env.SMTP_HOST;

// `log: false` suppresses the per-email dev log line (used for bulk sends, which log a summary)
async function sendEmail({ to, subject, text, html, log = true }) {
  const from = process.env.MAIL_FROM || 'Skyline Student Association <no-reply@skyline.test>';
  const info = await getTransporter().sendMail({ from, to, subject, text, html: html || undefined });
  if (devMode() && log && process.env.NODE_ENV !== 'test') console.log(`[email:dev] to=${to} subject="${subject}"`);
  return info;
}

module.exports = { sendEmail, devMode };
