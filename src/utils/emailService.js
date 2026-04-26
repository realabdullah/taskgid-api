import "dotenv/config";
import { Resend } from "resend";
import { SendMailClient } from "zeptomail";

if (!process.env.ZEPTO_MAIL_TOKEN && !process.env.RESEND_API_KEY) {
  console.warn(
    "Email Service: Both ZEPTO_MAIL_TOKEN and RESEND_API_KEY are missing. Auth emails cannot be sent.",
  );
}

/**
 * Email Service class for sending transactional emails via ZeptoMail & Resend
 */
class EmailService {
  /**
   * Initialize the email service
   */
  constructor() {
    const zeptoToken = process.env.ZEPTO_MAIL_TOKEN || "";
    this.zeptoClient = zeptoToken
      ? new SendMailClient({
          url: "https://api.zeptomail.com/v1.1/email",
          token: zeptoToken,
        })
      : null;

    const resendKey = process.env.RESEND_API_KEY || "";
    this.resendClient = resendKey ? new Resend(resendKey) : null;

    this.fromAddress = process.env.EMAIL_FROM || "noreply@tasks.abdspace.xyz";
    this.fromName = process.env.EMAIL_FROM_NAME || "ABD at TaskGid";
  }

  /**
   * Internal helper to dispatch email with fallback
   * @param {Object} params - Email parameters
   * @param {Object} params.to - Recipient details
   * @param {string} params.to.email - Recipient email
   * @param {string} params.to.name - Recipient name
   * @param {string} params.subject - Email subject
   * @param {string} params.html - Email HTML body
   * @return {Promise<Object|null>} Response or null on error
   * @private
   */
  async _dispatchEmail({ to, subject, html }) {
    let lastError = null;

    // 1. Try ZeptoMail first
    if (this.zeptoClient) {
      try {
        const response = await this.zeptoClient.sendMail({
          from: { address: this.fromAddress, name: this.fromName },
          to: [{ email_address: { address: to.email, name: to.name } }],
          subject,
          htmlbody: html,
        });
        console.log("ZeptoMail Success:", response);
        return response;
      } catch (error) {
        console.error("ZeptoMail Failed, trying fallback:", error.message);
        lastError = error;
      }
    }

    // 2. Fallback to Resend
    if (this.resendClient) {
      try {
        const response = await this.resendClient.emails.send({
          from: `${this.fromName} <${this.fromAddress}>`,
          to: to.email,
          subject,
          html,
        });
        console.log("Resend Success (Fallback):", response);
        return response;
      } catch (error) {
        console.error("Resend Fallback Failed:", error.message);
        lastError = error;
      }
    }

    if (!this.zeptoClient && !this.resendClient) {
      console.error("Email Service: No email providers initialized.");
    }

    return null;
  }

  /**
   * Check if email service is configured and can send emails
   * @return {boolean} True if can send
   */
  _canSend() {
    if (!this.zeptoClient && !this.resendClient) {
      console.error(
        "Email Service: Cannot send email, no email providers initialized.",
      );
      return false;
    }
    return true;
  }

  /**
   * Send a magic link for authentication.
   * @param {Object} user - User object
   * @param {string} magicLinkUrl - URL for magic link
   * @return {Promise<Object|null>} Response or null on error
   */
  async sendMagicLink(user, magicLinkUrl) {
    const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#f8f9fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f1523;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fc;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e6ef;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;background:linear-gradient(135deg,#eef2ff 0%,#f8faff 100%);border-bottom:1px solid #e2e6ef;">
                <div style="font-size:20px;font-weight:700;letter-spacing:0.2px;color:#312e81;">TaskGid</div>
                <div style="margin-top:4px;font-size:12px;color:#5a6478;">Secure sign-in</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px 8px;">
                <p style="margin:0 0 14px;font-size:16px;line-height:1.6;">Hi ${user.firstName || "there"},</p>
                <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#5a6478;">
                  Use the button below to securely sign in to your TaskGid account.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
                  <tr>
                    <td align="center" bgcolor="#4f46e5" style="border-radius:10px;">
                      <a href="${magicLinkUrl}" style="display:inline-block;padding:12px 20px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
                        Sign in to TaskGid
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 22px;font-size:13px;line-height:1.7;color:#657086;">
                  If the button doesn’t work, copy and paste this URL into your browser:<br />
                  <a href="${magicLinkUrl}" style="color:#4f46e5;word-break:break-all;">${magicLinkUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 24px;border-top:1px solid #e2e6ef;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#657086;">
                  If you didn’t request this email, you can safely ignore it.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    return this._dispatchEmail({
      to: { email: user.email, name: user.firstName || "User" },
      subject: "Your Magic Link for TaskGid",
      html,
    });
  }

  /**
   * Send a password reset email.
   * @param {Object} user - User object
   * @param {string} resetUrl - URL for password reset
   * @return {Promise<Object|null>} Response or null on error
   */
  async sendPasswordResetEmail(user, resetUrl) {
    const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#f8f9fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f1523;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fc;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e6ef;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;background:linear-gradient(135deg,#eef2ff 0%,#f8faff 100%);border-bottom:1px solid #e2e6ef;">
                <div style="font-size:20px;font-weight:700;letter-spacing:0.2px;color:#312e81;">TaskGid</div>
                <div style="margin-top:4px;font-size:12px;color:#5a6478;">Password reset</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px 8px;">
                <p style="margin:0 0 14px;font-size:16px;line-height:1.6;">Hi ${user.firstName || "there"},</p>
                <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#5a6478;">
                  We received a request to reset your TaskGid password.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
                  <tr>
                    <td align="center" bgcolor="#4f46e5" style="border-radius:10px;">
                      <a href="${resetUrl}" style="display:inline-block;padding:12px 20px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
                        Reset password
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 22px;font-size:13px;line-height:1.7;color:#657086;">
                  If the button doesn’t work, copy and paste this URL into your browser:<br />
                  <a href="${resetUrl}" style="color:#4f46e5;word-break:break-all;">${resetUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 24px;border-top:1px solid #e2e6ef;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#657086;">
                  If you didn’t request a password reset, you can safely ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    return this._dispatchEmail({
      to: { email: user.email, name: user.firstName || "User" },
      subject: "Reset Your TaskGid Password",
      html,
    });
  }

  /**
   * Send a welcome email.
   * @param {Object} user - User object
   * @return {Promise<Object|null>} Response or null on error
   */
  async sendWelcomeEmail(user) {
    const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#f8f9fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f1523;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fc;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e6ef;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:24px;background:linear-gradient(135deg,#eef2ff 0%,#f8faff 100%);border-bottom:1px solid #e2e6ef;">
                <div style="font-size:20px;font-weight:700;letter-spacing:0.2px;color:#312e81;">TaskGid</div>
                <div style="margin-top:4px;font-size:12px;color:#5a6478;">Welcome aboard</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px 8px;">
                <p style="margin:0 0 14px;font-size:16px;line-height:1.6;">Hi ${user.firstName || "there"},</p>
                <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#5a6478;">
                  Welcome to TaskGid. We’re excited to have you here.
                </p>
                <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#5a6478;">
                  Start organizing your workspaces, tasks, and team activity from your dashboard.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
                  <tr>
                    <td align="center" bgcolor="#4f46e5" style="border-radius:10px;">
                      <a href="${process.env.FRONTEND_URL}/dashboard" style="display:inline-block;padding:12px 20px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
                        Open dashboard
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 22px;font-size:13px;line-height:1.7;color:#657086;">
                  If the button doesn’t work, copy and paste this URL into your browser:<br />
                  <a href="${process.env.FRONTEND_URL}/dashboard" style="color:#4f46e5;word-break:break-all;">${process.env.FRONTEND_URL}/dashboard</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 24px;border-top:1px solid #e2e6ef;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#657086;">
                  You’re receiving this because a TaskGid account was created with this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    return this._dispatchEmail({
      to: { email: user.email, name: user.firstName || "User" },
      subject: "Welcome to TaskGid! 🎉",
      html,
    });
  }

  /**
   * Send a workspace invitation email.
   * @param {Object} invitee - Invitee details
   * @param {Object} inviter - Inviter details
   * @param {Object} workspace - Workspace details
   * @param {string} inviteUrl - URL to accept invite
   * @return {Promise<Object|null>} Response or null on error
   */
  async sendWorkspaceInviteEmail(invitee, inviter, workspace, inviteUrl) {
    const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#f8f9fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f1523;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fc;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e6ef;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;background:linear-gradient(135deg,#eef2ff 0%,#f8faff 100%);border-bottom:1px solid #e2e6ef;">
                <div style="font-size:20px;font-weight:700;letter-spacing:0.2px;color:#312e81;">TaskGid</div>
                <div style="margin-top:4px;font-size:12px;color:#5a6478;">Workspace invitation</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px 8px;">
                <p style="margin:0 0 14px;font-size:16px;line-height:1.6;">Hi ${invitee.name || "there"},</p>
                <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#5a6478;">
                  ${inviter.firstName || inviter.username} invited you to join
                  <strong style="color:#0f1523;">${workspace.title || workspace.name}</strong> on TaskGid.
                </p>
                <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#5a6478;">
                  Accept the invitation to collaborate with your team.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
                  <tr>
                    <td align="center" bgcolor="#4f46e5" style="border-radius:10px;">
                      <a href="${inviteUrl}" style="display:inline-block;padding:12px 20px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
                        Accept invitation
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 22px;font-size:13px;line-height:1.7;color:#657086;">
                  If the button doesn’t work, copy and paste this URL into your browser:<br />
                  <a href="${inviteUrl}" style="color:#4f46e5;word-break:break-all;">${inviteUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 24px;border-top:1px solid #e2e6ef;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#657086;">
                  If you weren’t expecting this invite, you can ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    return this._dispatchEmail({
      to: { email: invitee.email, name: invitee.name || invitee.email },
      subject: `You're invited to join ${workspace.title || workspace.name} on TaskGid`,
      html,
    });
  }
}

export default new EmailService();
