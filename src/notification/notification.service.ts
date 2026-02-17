/**
 * @file notification.service.ts
 *
 * @intent Sends transactional emails via SendGrid.
 *
 * @idea Each method constructs an HTML email template and dispatches it via
 *       sgMail.send().
 *
 * @usage Called by UserService for OTP emails, OrderService for order emails,
 *        AdminService for help center replies.
 *
 * @dataflow data object -> HTML template -> sgMail.send() -> SendGrid API
 *
 * @depends @sendgrid/mail, process.env.SENDGRID_API_KEY,
 *          process.env.SENDGRID_SENDER
 *
 * @notes
 *  - Email templates are hardcoded HTML.
 *  - Brand name "Puremoon" is hardcoded in templates.
 *  - SendGrid API key was previously hardcoded but now uses env var.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage } from 'src/common/utils/get-error-message';
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);


@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private server: any; // Socket.io server instance

  constructor(private readonly prisma: PrismaService) {}

  setServer(server: any) {
    this.server = server;
  }

  /**
   * Sends a registration welcome email containing an OTP for verification.
   *
   * @param data - { email: string, name: string, otp: string }
   *   - email: Recipient email address.
   *   - name:  Recipient display name (used in greeting).
   *   - otp:   One-Time Password for registration verification.
   */
  async mailService(data) {
    var mailOptions = {
      // from: "shayankar@technoexponent.com",
      from: process.env.SENDGRID_SENDER,
      to: data.email,
      subject: 'Welcome To Puremoon',
      html: `<table id="m_2717022745648039245m_-4740547828852282236mailerPage" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;line-height:24px;width:100%;font-size:14px;color:#1c1c1e;background-color:#fff;margin:0;padding:0" bgcolor="#fff">
      <tbody>
          <tr>
              <td valign="top" style="font-family:Arial;border-collapse:collapse">
                  <table cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;background-color:#fff;border-radius:4px;margin-top:0;margin-bottom:0;" bgcolor="#fff">
                      <tbody>
                          <tr>
                              <td align="center" width="600" valign="top" style="padding: 15px 32px;">
                              </td>
                          </tr>
                          <tr>
                              <td width="600" valign="top">
                                  <div style="background-color: #f5f5f5;padding: 24px 42px 50px;border-radius: 10px;">
                                      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                                          <tbody>
                                              <tr>
                                                  <td width="600" valign="top">
                                                      <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">Hello, ${data.name}</p>
                                                      <p style="margin: 0px;padding: 8px 0;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;"></p>
                                                      <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">Thank you for choosing Puremoon! Your security is important to us. To complete your registration, please use the following One-Time Password (OTP).</p>
                                                      <p style="margin: 0px;padding: 8px 0;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;"></p>
                                                      <h3 style="margin: 0px;padding: 8px 0;color: #2f327d;font-size: 24px;font-weight: 600;">Your OTP : ${data.otp}</h3>
                                                      <p style="margin: 0px;padding: 8px 0;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;"></p>
                                                      <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">Please note that this OTP is valid for the next 10 minutes. if you don't verify within this time, you'll need to request a new OTP.</p>
                                                      <p style="margin: 0px;padding: 8px 0;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;"></p>
                                                      <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">If you didn't initiate this process, please disregard this email.
                                                      </p>
                                                      <p style="margin: 0px;padding: 8px 0;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;"></p>
                                                      <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">Thank you for choosing Puremoon.</p>
                                                      <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">Best regards,</p>
                                                      <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">The Puremoon Team</p>
                                                  </td>
                                              </tr>
                                              <tr>
                                                  <td width="600" valign="top" style="padding: 32px 0">
                                                  </td>
                                              </tr>
                                              <tr>
                                                  <td width="600" valign="top" style="padding: 24px 0 0" align="center">
                                                      <p style="margin: 0px;padding: 0 0;color: #000;font-size: 14px;font-weight: 400;">© 2025 Puremoon. All rights reserved </p>
                                                  </td>
                                              </tr>
                                          </tbody>
                                      </table>
  
                                  </div>
                              </td>
                          </tr>
                      </tbody>
                  </table>
  
              </td>
  
          </tr>
      </tbody>
  </table>`,
    };
    sgMail
      .send(mailOptions)
      .then(() => {
        this.logger.log('Email sent successfully');
      })
      .catch((error) => {
        this.logger.error(`Failed to send email: ${error.message}`, error.stack);
      });
  }

  /**
   * Sends an OTP verification email. Similar to {@link mailService} but uses
   * a different subject line ("Verify OTP for Puremoon" instead of
   * "Welcome To Puremoon").
   *
   * @param data - { email: string, name: string, otp: string }
   *   - email: Recipient email address.
   *   - name:  Recipient display name (used in greeting).
   *   - otp:   One-Time Password to be verified.
   */
  async sendOtp(data) {
    var mailOptions = {
      // from: "shayankar@technoexponent.com",
      from: process.env.SENDGRID_SENDER,
      to: data.email,
      subject: 'Verify OTP for Puremoon',
      html: `<table id="m_2717022745648039245m_-4740547828852282236mailerPage" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;line-height:24px;width:100%;font-size:14px;color:#1c1c1e;background-color:#fff;margin:0;padding:0" bgcolor="#fff">
      <tbody>
          <tr>
              <td valign="top" style="font-family:Arial;border-collapse:collapse">
                  <table cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;background-color:#fff;border-radius:4px;margin-top:0;margin-bottom:0;" bgcolor="#fff">
                      <tbody>
                          <tr>
                              <td align="center" width="600" valign="top" style="padding: 15px 32px;">
                              </td>
                          </tr>
                          <tr>
                              <td width="600" valign="top">
                                  <div style="background-color: #f5f5f5;padding: 24px 42px 50px;border-radius: 10px;">
                                      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                                          <tbody>
                                              <tr>
                                                  <td width="600" valign="top">
                                                      <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">Hello, ${data.name}</p>
                                                      <p style="margin: 0px;padding: 8px 0;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;"></p>
                                                      <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">Thank you for choosing Puremoon! Your security is important to us. To verify your OTP, please use the following One-Time Password (OTP).</p>
                                                      <p style="margin: 0px;padding: 8px 0;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;"></p>
                                                      <h3 style="margin: 0px;padding: 8px 0;color: #2f327d;font-size: 24px;font-weight: 600;">Your OTP : ${data.otp}</h3>
                                                      <p style="margin: 0px;padding: 8px 0;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;"></p>
                                                      <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">Please note that this OTP is valid for the next 10 minutes. if you don't verify within this time, you'll need to request a new OTP.</p>
                                                      <p style="margin: 0px;padding: 8px 0;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;"></p>
                                                      <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">If you didn't initiate this process, please disregard this email.
                                                      </p>
                                                      <p style="margin: 0px;padding: 8px 0;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;"></p>
                                                      <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">Thank you for choosing Puremoon.</p>
                                                      <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">Best regards,</p>
                                                      <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">The Puremoon Team</p>
                                                  </td>
                                              </tr>
                                              <tr>
                                                  <td width="600" valign="top" style="padding: 32px 0">
                                                  </td>
                                              </tr>
                                              <tr>
                                                  <td width="600" valign="top" style="padding: 24px 0 0" align="center">
                                                      <p style="margin: 0px;padding: 0 0;color: #000;font-size: 14px;font-weight: 400;">© 2025 Puremoon. All rights reserved </p>
                                                  </td>
                                              </tr>
                                          </tbody>
                                      </table>
  
                                  </div>
                              </td>
                          </tr>
                      </tbody>
                  </table>
  
              </td>
  
          </tr>
      </tbody>
  </table>`,
    };
    sgMail
      .send(mailOptions)
      .then(() => {
        this.logger.log('Email sent successfully');
      })
      .catch((error) => {
        this.logger.error(`Failed to send email: ${error.message}`, error.stack);
      });
  }

  /**
   * Sends a welcome email with an auto-generated password for users who were
   * created during the checkout flow (i.e., guest checkout that creates an
   * account).
   *
   * SECURITY NOTE: Sends a plaintext password via email.
   *
   * @param data - { email: string, name: string, rawPassword: string }
   *   - email:       Recipient email address.
   *   - name:        Recipient display name (used in greeting).
   *   - rawPassword: The auto-generated plaintext password.
   */
  async newUserCreatedOnCheckout(data) {
    var mailOptions = {
      // from: "shayankar@technoexponent.com",
      from: process.env.SENDGRID_SENDER,
      to: data.email,
      subject: 'Welcome To Puremoon',
      html: `<table id="m_2717022745648039245m_-4740547828852282236mailerPage" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;line-height:24px;width:100%;font-size:14px;color:#1c1c1e;background-color:#fff;margin:0;padding:0" bgcolor="#fff">
        <tbody>
            <tr>
                <td valign="top" style="font-family:Arial;border-collapse:collapse">
                    <table cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;background-color:#fff;border-radius:4px;margin-top:0;margin-bottom:0;" bgcolor="#fff">
                        <tbody>
                            <tr>
                                <td align="center" width="600" valign="top" style="padding: 15px 32px;">
                                </td>
                            </tr>
                            <tr>
                                <td width="600" valign="top">
                                    <div style="background-color: #f5f5f5;padding: 24px 42px 50px;border-radius: 10px;">
                                        <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                                            <tbody>
                                                <tr>
                                                    <td width="600" valign="top">
                                                        <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">Hello, ${data.name}</p>
                                                        <p style="margin: 0px;padding: 8px 0;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;"></p>
                                                        <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">Thank you for choosing Puremoon! Your security is important to us. This is your password!</p>
                                                        <p style="margin: 0px;padding: 8px 0;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;"></p>
                                                        <h3 style="margin: 0px;padding: 8px 0;color: #2f327d;font-size: 24px;font-weight: 600;">Your Password : ${data.rawPassword}</h3>
                                                        <p style="margin: 0px;padding: 8px 0;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;"></p>
                                                        <p style="margin: 0px;padding: 8px 0;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;"></p>
                                                        <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">If you didn't initiate this process, please disregard this email.
                                                        </p>
                                                        <p style="margin: 0px;padding: 8px 0;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;"></p>
                                                        <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">Thank you for choosing Puremoon.</p>
                                                        <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">Best regards,</p>
                                                        <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">The Puremoon Team</p>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td width="600" valign="top" style="padding: 32px 0">
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td width="600" valign="top" style="padding: 24px 0 0" align="center">
                                                        <p style="margin: 0px;padding: 0 0;color: #000;font-size: 14px;font-weight: 400;">© 2025 Puremoon. All rights reserved </p>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
    
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
    
                </td>
    
            </tr>
        </tbody>
    </table>`,
    };
    sgMail
      .send(mailOptions)
      .then(() => {
        this.logger.log('Email sent successfully');
      })
      .catch((error) => {
        this.logger.error(`Failed to send email: ${error.message}`, error.stack);
      });
  }

  /**
   * Sends a welcome email with a password to a newly added team member.
   *
   * SECURITY NOTE: Sends a plaintext password via email.
   *
   * @param data - { email: string, name: string, password: string }
   *   - email:    Recipient email address.
   *   - name:     Recipient display name (used in greeting).
   *   - password: The plaintext password assigned to the new member.
   */
  async addMemberMail(data) {
    var mailOptions = {
      // from: "shayankar@technoexponent.com",
      from: process.env.SENDGRID_SENDER,
      to: data.email,
      subject: 'Welcome To Puremoon',
      html: `<table id="m_2717022745648039245m_-4740547828852282236mailerPage" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;line-height:24px;width:100%;font-size:14px;color:#1c1c1e;background-color:#fff;margin:0;padding:0" bgcolor="#fff">
        <tbody>
            <tr>
                <td valign="top" style="font-family:Arial;border-collapse:collapse">
                    <table cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;background-color:#fff;border-radius:4px;margin-top:0;margin-bottom:0;" bgcolor="#fff">
                        <tbody>
                            <tr>
                                <td align="center" width="600" valign="top" style="padding: 15px 32px;">
                                </td>
                            </tr>
                            <tr>
                                <td width="600" valign="top">
                                    <div style="background-color: #f5f5f5;padding: 24px 42px 50px;border-radius: 10px;">
                                        <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                                            <tbody>
                                                <tr>
                                                    <td width="600" valign="top">
                                                        <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">Hello, ${data.name}</p>
                                                        <p style="margin: 0px;padding: 8px 0;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;"></p>
                                                        <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">Thank you for choosing Puremoon! Your security is important to us. To complete your registration, please use the following Password.</p>
                                                        <p style="margin: 0px;padding: 8px 0;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;"></p>
                                                        <h3 style="margin: 0px;padding: 8px 0;color: #2f327d;font-size: 24px;font-weight: 600;">Your Password : ${data.password}</h3>
                                                        <p style="margin: 0px;padding: 8px 0;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;"></p>
                                                        <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">If you didn't initiate this process, please disregard this email.
                                                        </p>
                                                        <p style="margin: 0px;padding: 8px 0;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;"></p>
                                                        <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">Thank you for choosing Puremoon.</p>
                                                        <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">Best regards,</p>
                                                        <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">The Puremoon Team</p>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td width="600" valign="top" style="padding: 32px 0">
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td width="600" valign="top" style="padding: 24px 0 0" align="center">
                                                        <p style="margin: 0px;padding: 0 0;color: #000;font-size: 14px;font-weight: 400;">© 2025 Puremoon. All rights reserved </p>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
    
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
    
                </td>
    
            </tr>
        </tbody>
    </table>`,
    };
    sgMail
      .send(mailOptions)
      .then(() => {
        this.logger.log('Email sent successfully');
      })
      .catch((error) => {
        this.logger.error(`Failed to send email: ${error.message}`, error.stack);
      });
  }

  /**
   * Sends a help center response email that includes both the user's original
   * query and the admin's response.
   *
   * @param data - { email: string, name: string, userQuery: string, response: string }
   *   - email:     Recipient email address.
   *   - name:      Recipient display name (used in greeting).
   *   - userQuery: The original question/query submitted by the user.
   *   - response:  The admin's reply to the user's query.
   */
  async replyHelpCenter(data) {
    const mailOptions = {
      // from: "shayankar@technoexponent.com",
      from: process.env.SENDGRID_SENDER,
      to: data.email,
      subject: 'Response to Your Help Center Inquiry - Puremoon',
      html: `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;line-height:24px;width:100%;font-size:14px;color:#1c1c1e;background-color:#fff;margin:0;padding:0" bgcolor="#fff">
          <tbody>
            <tr>
              <td valign="top" style="font-family:Arial;border-collapse:collapse">
                <table cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;background-color:#fff;border-radius:4px;margin-top:0;margin-bottom:0;" bgcolor="#fff">
                  <tbody>
                    <tr>
                      <td align="center" width="600" valign="top" style="padding: 15px 32px;">
                        <h2 style="color: #2f327d; font-size: 22px; font-weight: 600;">Help Center Response</h2>
                      </td>
                    </tr>
                    <tr>
                      <td width="600" valign="top">
                        <div style="background-color: #f5f5f5;padding: 24px 42px 50px;border-radius: 10px;">
                          <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                            <tbody>
                              <tr>
                                <td width="600" valign="top">
                                  <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">Hello, ${data.name},</p>
                                  <p style="margin: 0px;padding: 8px 0;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">We have received your query and our team has provided a response below.</p>
  
                                  <h3 style="margin: 0px;padding: 10px 0;color: #2f327d;font-size: 20px;font-weight: 600;">Your Query:</h3>
                                  <p style="background: #fff; padding: 10px; border-left: 4px solid #2f327d; color: #000;font-size: 16px; line-height: 25px; font-weight: 400;">
                                    ${data.userQuery}
                                  </p>
  
                                  <h3 style="margin: 0px;padding: 10px 0;color: #2f327d;font-size: 20px;font-weight: 600;">Our Response:</h3>
                                  <p style="background: #fff; padding: 10px; border-left: 4px solid #28a745; color: #000;font-size: 16px; line-height: 25px; font-weight: 400;">
                                    ${data.response}
                                  </p>
  
                                  <p style="margin: 0px;padding: 15px 0;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">If you need further assistance, feel free to reply to this email or visit our <a href="https://dev.ultrasooq.com/" style="color: #2f327d; text-decoration: none;">Help Center</a>.</p>
  
                                  <p style="margin: 0px;padding: 15px 0;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">Best regards,</p>
                                  <p style="margin: 0px;padding: 0px;color: #000;font-size: 16px;line-height: 25px;font-weight: 400;">The Puremoon Team</p>
                                </td>
                              </tr>
                              <tr>
                                <td width="600" valign="top" style="padding: 32px 0">
                                </td>
                              </tr>
                              <tr>
                                <td width="600" valign="top" style="padding: 24px 0 0" align="center">
                                  <p style="margin: 0px;padding: 0 0;color: #000;font-size: 14px;font-weight: 400;">© 2025 Puremoon. All rights reserved.</p>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      `,
    };

    sgMail
      .send(mailOptions)
      .then(() => {
        this.logger.log('Email sent successfully');
      })
      .catch((error) => {
        this.logger.error(`Failed to send email: ${error.message}`, error.stack);
      });
  }

  // ============================================
  // NOTIFICATION SYSTEM METHODS
  // ============================================

  /**
   * Create a new notification
   */
  async createNotification(data: {
    userId: number;
    type: string;
    title: string;
    message: string;
    data?: any;
    link?: string;
    icon?: string;
  }) {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          userId: data.userId,
          type: data.type,
          title: data.title,
          message: data.message,
          data: data.data || {},
          link: data.link || null,
          icon: data.icon || null,
        },
      });

      // Emit socket event to the user
      if (this.server) {
        this.server.to(`user-${data.userId}`).emit('notification', notification);
        
        // Update unread count
        const unreadCount = await this.prisma.notification.count({
          where: {
            userId: data.userId,
            read: false,
          },
        });
        this.server.to(`user-${data.userId}`).emit('notification:count', unreadCount);
      }

      return notification;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get notifications for a user
   */
  async getNotifications(
    req: any,
    page: number = 1,
    limit: number = 10,
    type?: string,
    read?: string,
  ) {
    try {
      const userId = req?.user?.id;
      const skip = (page - 1) * limit;

      const where: any = {
        userId: userId,
      };

      if (type) {
        where.type = type;
      }

      if (read !== undefined) {
        where.read = read === 'true';
      }

      const [notifications, total, unreadCount] = await Promise.all([
        this.prisma.notification.findMany({
          where,
          orderBy: {
            createdAt: 'desc',
          },
          skip,
          take: limit,
        }),
        this.prisma.notification.count({ where }),
        this.prisma.notification.count({
          where: {
            userId,
            read: false,
          },
        }),
      ]);

      return {
        status: true,
        message: 'Notifications fetched successfully',
        data: {
          data: notifications,
          total,
          page,
          limit,
          unreadCount,
        },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error fetching notifications',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Get unread count for a user
   */
  async getUnreadCount(req: any) {
    try {
      const userId = req?.user?.id;

      const count = await this.prisma.notification.count({
        where: {
          userId,
          read: false,
        },
      });

      return {
        status: true,
        message: 'Unread count fetched successfully',
        data: {
          count,
        },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error fetching unread count',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(req: any, notificationId: number) {
    try {
      const userId = req?.user?.id;

      // Verify notification belongs to user
      const notification = await this.prisma.notification.findFirst({
        where: {
          id: notificationId,
          userId: userId,
        },
      });

      if (!notification) {
        return {
          status: false,
          message: 'Notification not found',
        };
      }

      const updated = await this.prisma.notification.update({
        where: {
          id: notificationId,
        },
        data: {
          read: true,
          readAt: new Date(),
        },
      });

      // Update unread count via socket
      if (this.server) {
        const unreadCount = await this.prisma.notification.count({
          where: {
            userId,
            read: false,
          },
        });
        this.server.to(`user-${userId}`).emit('notification:count', unreadCount);
      }

      return {
        status: true,
        message: 'Notification marked as read',
        data: updated,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error marking notification as read',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(req: any) {
    try {
      const userId = req?.user?.id;

      const result = await this.prisma.notification.updateMany({
        where: {
          userId,
          read: false,
        },
        data: {
          read: true,
          readAt: new Date(),
        },
      });

      // Update unread count via socket
      if (this.server) {
        this.server.to(`user-${userId}`).emit('notification:count', 0);
      }

      return {
        status: true,
        message: 'All notifications marked as read',
        data: {
          count: result.count,
        },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error marking all notifications as read',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Delete a notification
   */
  async deleteNotification(req: any, notificationId: number) {
    try {
      const userId = req?.user?.id;

      // Verify notification belongs to user
      const notification = await this.prisma.notification.findFirst({
        where: {
          id: notificationId,
          userId: userId,
        },
      });

      if (!notification) {
        return {
          status: false,
          message: 'Notification not found',
        };
      }

      await this.prisma.notification.delete({
        where: {
          id: notificationId,
        },
      });

      // Update unread count via socket
      if (this.server) {
        const unreadCount = await this.prisma.notification.count({
          where: {
            userId,
            read: false,
          },
        });
        this.server.to(`user-${userId}`).emit('notification:count', unreadCount);
      }

      return {
        status: true,
        message: 'Notification deleted successfully',
        data: {
          success: true,
        },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error deleting notification',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Delete all notifications for a user
   */
  async deleteAllNotifications(req: any) {
    try {
      const userId = req?.user?.id;

      const result = await this.prisma.notification.deleteMany({
        where: {
          userId,
        },
      });

      // Update unread count via socket
      if (this.server) {
        this.server.to(`user-${userId}`).emit('notification:count', 0);
      }

      return {
        status: true,
        message: 'All notifications deleted successfully',
        data: {
          success: true,
          count: result.count,
        },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error deleting all notifications',
        error: getErrorMessage(error),
      };
    }
  }
}
