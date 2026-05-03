import 'dotenv/config';
import { NOTIFICATION_TYPES, NOTIFICATION_DATA } from '../src/constants/notificationTypes.js';

async function freshSyncNovu() {
    const apiKey = process.env.NOVU_API_KEY;
    if (!apiKey) {
        console.error('NOVU_API_KEY is missing in .env');
        process.exit(1);
    }

    const baseUrl = 'https://api.novu.co/v1';
    const headers = {
        'Authorization': `ApiKey ${apiKey}`,
        'Content-Type': 'application/json'
    };

    console.log('Fetching all workflows for deletion...');
    const listRes = await fetch(`${baseUrl}/notification-templates?limit=100`, { headers });
    const listData = await listRes.json();
    const workflows = listData.data || [];
    
    console.log(`Found ${workflows.length} workflows. Deleting all...`);
    for (const w of workflows) {
        console.log(`Deleting ${w.triggers[0].identifier} (${w._id})...`);
        const delRes = await fetch(`${baseUrl}/notification-templates/${w._id}`, {
            method: 'DELETE',
            headers
        });
        if (!delRes.ok) console.error(`Failed to delete ${w._id}`);
    }

    console.log('Fetching notification groups...');
    const groupRes = await fetch(`${baseUrl}/notification-groups`, { headers });
    const groupData = await groupRes.json();
    const groups = groupData.data || [];
    let generalGroup = groups.find(g => g.name === 'General' || g.name === 'Default') || groups[0];

    const workflowMappings = {
        [NOTIFICATION_TYPES.TASK_ASSIGNED]: 'new-task-assigned',
        [NOTIFICATION_TYPES.TASK_UPDATED]: 'task-updated',
        [NOTIFICATION_TYPES.TASK_DELETED]: 'task-deleted',
        [NOTIFICATION_TYPES.TASK_COMPLETED]: 'task-completed',
        [NOTIFICATION_TYPES.TASK_COMMENTED]: 'task-commented',
        [NOTIFICATION_TYPES.TASK_MENTIONED]: 'task-mentioned',
        [NOTIFICATION_TYPES.WORKSPACE_INVITE]: 'workspace-invitation',
        [NOTIFICATION_TYPES.WORKSPACE_JOINED]: 'new-workspace-member',
        [NOTIFICATION_TYPES.WORKSPACE_LEFT]: 'member-left-workspace',
        [NOTIFICATION_TYPES.WORKSPACE_ROLE_CHANGED]: 'workspace-role-updated',
        [NOTIFICATION_TYPES.COMMENT_CREATED]: 'new-comment',
        [NOTIFICATION_TYPES.COMMENT_UPDATED]: 'comment-updated',
        [NOTIFICATION_TYPES.COMMENT_DELETED]: 'comment-deleted',
        [NOTIFICATION_TYPES.COMMENT_LIKED]: 'comment-liked',
        [NOTIFICATION_TYPES.COMMENT_MENTIONED]: 'mentioned-in-comment',
        [NOTIFICATION_TYPES.USER_MENTIONED]: 'you-were-mentioned',
        [NOTIFICATION_TYPES.WORKSPACE_INVITE_DECLINED]: 'workspace-invite-declined',
    };

    console.log('Creating workflows fresh...');
    for (const [type, slug] of Object.entries(workflowMappings)) {
        const data = NOTIFICATION_DATA[type];
        if (!data) continue;

        const emailHtml = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#f8f9fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f1523;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fc;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e6ef;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:20px 24px;background:linear-gradient(135deg,#eef2ff 0%,#f8faff 100%);border-bottom:1px solid #e2e6ef;">
                <div style="font-size:20px;font-weight:700;letter-spacing:0.2px;color:#312e81;">TaskGid</div>
                <div style="margin-top:4px;font-size:12px;color:#5a6478;">${data.title}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px 8px;">
                <p style="margin:0 0 14px;font-size:16px;line-height:1.6;">Hi {{firstName}},</p>
                <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#5a6478;">
                  {{payload.message}}
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
                  <tr>
                    <td align="center" bgcolor="#4f46e5" style="border-radius:10px;">
                      <a href="${process.env.FRONTEND_URL || 'https://tasks.abdspace.xyz'}/dashboard" style="display:inline-block;padding:12px 20px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
                        View in TaskGid
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 24px;border-top:1px solid #e2e6ef;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#657086;">
                  You’re receiving this because you have notifications enabled for this workspace.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

        const workflowData = {
            name: data.title,
            notificationGroupId: generalGroup._id,
            triggers: [{ identifier: slug, type: 'event' }],
            steps: [
                {
                    template: {
                        type: 'in_app',
                        content: '{{payload.message}}',
                    },
                    active: true
                },
                {
                    template: {
                        type: 'email',
                        subject: 'TaskGid: {{payload.message}}',
                        content: emailHtml,
                        contentType: 'customHtml'
                    },
                    active: true
                }
            ],
            active: true
        };

        try {
            console.log(`Creating: ${slug}...`);
            const res = await fetch(`${baseUrl}/notification-templates`, {
                method: 'POST',
                headers,
                body: JSON.stringify(workflowData)
            });
            
            if (!res.ok) {
                const err = await res.json();
                console.error(`Error with ${slug}:`, err.message);
            } else {
                console.log(`Success: ${slug}`);
            }
        } catch (error) {
            console.error(`Failed: ${slug}`, error.message);
        }
    }

    console.log('Fresh Novu sync completed!');
}

freshSyncNovu();
