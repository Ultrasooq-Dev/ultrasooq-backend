/**
 * @file mailer.ts — Better Auth email senders backed by the existing
 * SendGrid wrapper in notification.service.ts. The wrapper falls back
 * to a [DEV-MAIL] console log when SendGrid is unconfigured or rejects
 * (e.g. trial credits exhausted), so local dev keeps working.
 */
// Import notification.service for its side effect: it wraps sgMail.send
// with the dev-mail fallback. Both files share the same sgMail singleton.
require('../notification/notification.service');
const sgMail = require('@sendgrid/mail');

const FROM = () => process.env.SENDGRID_SENDER || 'noreply@ultrasooq.local';
const APP = 'Ultrasooq';

const verificationHtml = (name: string, url: string) => `
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px;font-family:Arial,sans-serif;color:#1c1c1e;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;padding:32px;">
      <tr><td>
        <h2 style="margin:0 0 16px;color:#2f327d;">Verify your email</h2>
        <p style="margin:0 0 12px;font-size:16px;">Hi ${name || 'there'},</p>
        <p style="margin:0 0 12px;font-size:16px;">Please confirm your email to finish setting up your ${APP} account.</p>
        <p style="margin:24px 0;"><a href="${url}" style="display:inline-block;padding:12px 24px;background:#2f327d;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Verify email</a></p>
        <p style="margin:0 0 12px;font-size:14px;color:#666;">If the button doesn't work, copy this link: ${url}</p>
        <p style="margin:24px 0 0;font-size:14px;color:#666;">If you didn't sign up, you can safely ignore this email.</p>
      </td></tr>
    </table>
  </td></tr>
</table>`;

const resetPasswordHtml = (name: string, url: string) => `
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px;font-family:Arial,sans-serif;color:#1c1c1e;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;padding:32px;">
      <tr><td>
        <h2 style="margin:0 0 16px;color:#2f327d;">Reset your password</h2>
        <p style="margin:0 0 12px;font-size:16px;">Hi ${name || 'there'},</p>
        <p style="margin:0 0 12px;font-size:16px;">Click the button below to set a new password. The link expires in 1 hour.</p>
        <p style="margin:24px 0;"><a href="${url}" style="display:inline-block;padding:12px 24px;background:#2f327d;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Reset password</a></p>
        <p style="margin:0 0 12px;font-size:14px;color:#666;">If the button doesn't work, copy this link: ${url}</p>
        <p style="margin:24px 0 0;font-size:14px;color:#666;">If you didn't request this, you can safely ignore this email.</p>
      </td></tr>
    </table>
  </td></tr>
</table>`;

export async function sendVerificationMail({
  to,
  name,
  url,
}: {
  to: string;
  name: string;
  url: string;
}) {
  await sgMail.send({
    from: FROM(),
    to,
    subject: `Verify your ${APP} email`,
    html: verificationHtml(name, url),
  });
}

export async function sendResetPasswordMail({
  to,
  name,
  url,
}: {
  to: string;
  name: string;
  url: string;
}) {
  await sgMail.send({
    from: FROM(),
    to,
    subject: `Reset your ${APP} password`,
    html: resetPasswordHtml(name, url),
  });
}

const otpHtml = (otp: string, label: string) => `
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px;font-family:Arial,sans-serif;color:#1c1c1e;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;padding:32px;">
      <tr><td>
        <h2 style="margin:0 0 16px;color:#2f327d;">${label}</h2>
        <p style="margin:0 0 12px;font-size:16px;">Use the code below to complete your sign-in. It expires shortly.</p>
        <p style="margin:24px 0;font-size:32px;font-weight:700;letter-spacing:6px;color:#2f327d;text-align:center;">${otp}</p>
        <p style="margin:24px 0 0;font-size:14px;color:#666;">If you didn't request this code, you can safely ignore this email.</p>
      </td></tr>
    </table>
  </td></tr>
</table>`;

export async function sendOtpMail({
  to,
  otp,
  label,
}: {
  to: string;
  otp: string;
  label?: string;
}) {
  await sgMail.send({
    from: FROM(),
    to,
    subject: `Your ${APP} verification code`,
    html: otpHtml(otp, label || `Your ${APP} verification code`),
  });
}

const invitationHtml = (orgName: string, inviterName: string, link: string) => `
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px;font-family:Arial,sans-serif;color:#1c1c1e;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;padding:32px;">
      <tr><td>
        <h2 style="margin:0 0 16px;color:#2f327d;">You're invited to ${orgName}</h2>
        <p style="margin:0 0 12px;font-size:16px;">${inviterName} invited you to join <strong>${orgName}</strong> on ${APP}.</p>
        <p style="margin:24px 0;"><a href="${link}" style="display:inline-block;padding:12px 24px;background:#2f327d;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Accept invitation</a></p>
        <p style="margin:0 0 12px;font-size:14px;color:#666;">If the button doesn't work, copy this link: ${link}</p>
      </td></tr>
    </table>
  </td></tr>
</table>`;

export async function sendInvitationMail({
  to,
  orgName,
  inviterName,
  link,
}: {
  to: string;
  orgName: string;
  inviterName: string;
  link: string;
}) {
  await sgMail.send({
    from: FROM(),
    to,
    subject: `You're invited to ${orgName} on ${APP}`,
    html: invitationHtml(orgName, inviterName, link),
  });
}
