import {MailerSend, EmailParams, Sender, Recipient} from 'mailersend';
import 'dotenv/config';

// Ensure required environment variables are set
if (
    !process.env.MAILERSEND_API_KEY ||
    !process.env.EMAIL_FROM ||
    !process.env.EMAIL_FROM_NAME
) {
    console.warn(
        'Email Service: MAILERSEND_API_KEY, EMAIL_FROM, or EMAIL_FROM_NAME environment variables are missing. ' +
        'Email sending will be disabled.',
    );
}
if (!process.env.MAILERSEND_WELCOME_TEMPLATE_ID) {
    console.warn(
        'Email Service: MAILERSEND_WELCOME_TEMPLATE_ID is not set. Welcome emails cannot be sent.',
    );
}
if (!process.env.MAILERSEND_INVITE_TEMPLATE_ID) {
    console.warn(
        'Email Service: MAILERSEND_INVITE_TEMPLATE_ID is not set. Invite emails cannot be sent.',
    );
}

/**
 * Service class for handling email sending via MailerSend.
 */
class EmailService {
    /**
   * Initializes the MailerSend client and default sender.
   */
    constructor() {
        this.apiKey = process.env.MAILERSEND_API_KEY || '';
        this.mailerSend = this.apiKey ?
            new MailerSend({apiKey: this.apiKey}) :
            null;
        this.sender = new Sender(
            process.env.EMAIL_FROM || 'default@example.com',
            process.env.EMAIL_FROM_NAME || 'Default Sender',
        );
    }

    /**
   * Internal helper to check if the MailerSend client is initialized.
   * @private
   * @return {boolean} True if the client is ready to send emails, false otherwise.
   */
    _canSend() {
        if (!this.mailerSend) {
            console.error(
                'Email Service: Cannot send email, MailerSend client not initialized (missing API key).',
            );
            return false;
        }
        return true;
    }

    /**
   * Sends a welcome email using a MailerSend template.
   * @param {object} user - User object ({ email, firstName }).
   * @param {string} [templateId] - MailerSend Template ID (defaults from env).
   * @return {Promise<object | null>} MailerSend API response or null if sending failed/disabled.
   */
    async sendWelcomeEmail(
        user,
        templateId = process.env.MAILERSEND_WELCOME_TEMPLATE_ID,
    ) {
        if (!this._canSend() || !templateId) {
            console.error(
                `Email Service: Cannot send welcome email. Service enabled: ${!!this
                    .mailerSend},
                Template ID present: ${!!templateId}`,
            );
            return null;
        }
        if (!user || !user.email || !user.firstName) {
            console.error(
                'Email Service: Invalid user object passed to sendWelcomeEmail.',
            );
            return null;
        }

        const recipients = [new Recipient(user.email, user.firstName)];

        // Variables expected by your MailerSend welcome template
        const personalization = [
            {
                email: user.email,
                data: {
                    firstName: user.firstName,
                    // Add other variables your welcome template needs, e.g.:
                    // dashboardUrl: `${process.env.APP_URL}/dashboard`,
                    // supportEmail: process.env.SUPPORT_EMAIL
                },
            },
        ];

        const emailParams = new EmailParams()
            .setFrom(this.sender)
            .setTo(recipients)
        // .setReplyTo(this.sender) // Optional: Set if needed
            .setSubject('Welcome to TaskGid! 🎉') // Subject can also be set in the template
            .setTemplateId(templateId)
            .setPersonalization(personalization);

        try {
            console.log(
                `Sending welcome email to ${user.email} using template ${templateId}`,
            );
            const response = await this.mailerSend.email.send(emailParams);
            console.log('MailerSend Welcome Email Response:', response.statusCode);
            return response;
        } catch (error) {
            console.error(
                'MailerSend Error (sendWelcomeEmail):',
                error?.response?.body || error,
            );
            return null;
        }
    }

    /**
   * Sends a workspace invitation email using a MailerSend template.
   * @param {object} invitee - Details of the person being invited ({ email, name - optional }).
   * @param {object} inviter - User object of the person sending the invite ({ firstName, username }).
   * @param {object} workspace - Workspace object ({ title }).
   * @param {string} inviteUrl - The URL for the invitee to accept the invitation.
   * @param {string} [templateId] - MailerSend Template ID (defaults from env).
   * @return {Promise<object | null>} MailerSend API response or null if sending failed/disabled.
   */
    async sendWorkspaceInviteEmail(
        invitee,
        inviter,
        workspace,
        inviteUrl,
        templateId = process.env.MAILERSEND_INVITE_TEMPLATE_ID,
    ) {
        if (!this._canSend() || !templateId) {
            console.error(
                `Email Service: Cannot send invite email. Service enabled: ${!!this
                    .mailerSend}, Template ID present: ${!!templateId}`,
            );
            return null;
        }
        if (!invitee || !invitee.email || !inviter || !workspace || !inviteUrl) {
            console.error(
                'Email Service: Missing required parameters for sendWorkspaceInviteEmail.',
            );
            return null;
        }

        const recipients = [
            new Recipient(invitee.email, invitee.name || invitee.email),
        ];

        // Variables expected by your MailerSend invite template
        const personalization = [
            {
                email: invitee.email,
                data: {
                    inviteeName: invitee.name || 'there', // e.g., "Hi there," or "Hi Jane,"
                    inviterName: inviter.firstName || inviter.username,
                    workspaceName: workspace.title,
                    inviteLink: inviteUrl,
                    // Add other variables your invite template needs
                },
            },
        ];

        const emailParams = new EmailParams()
            .setFrom(this.sender)
            .setTo(recipients)
            .setSubject(`You're invited to join ${workspace.title} on TaskGid`)
            .setTemplateId(templateId)
            .setPersonalization(personalization);

        try {
            console.log(
                `Sending invite email to ${invitee.email} for workspace ` +
                `${workspace.title} using template ${templateId}`,
            );
            const response = await this.mailerSend.email.send(emailParams);
            console.log('MailerSend Invite Email Response:', response.statusCode);
            return response;
        } catch (error) {
            console.error(
                'MailerSend Error (sendWorkspaceInviteEmail):',
                error?.response?.body || error,
            );
            return null;
        }
    }

    // Remove or adapt the old generic sendEmail and loadTemplate methods if not needed
    // async loadTemplate(templateName) { ... }
    // async sendEmail(templateName, data, options) { ... }
}

// Export a singleton instance
export default new EmailService();
