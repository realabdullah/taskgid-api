import { Novu } from '@novu/node';
import 'dotenv/config';
import { NOTIFICATION_TYPES, NOTIFICATION_DATA } from '../src/constants/notificationTypes.js';

async function syncNovu() {
    if (!process.env.NOVU_API_KEY) {
        console.error('NOVU_API_KEY is missing in .env');
        process.exit(1);
    }

    const novu = new Novu(process.env.NOVU_API_KEY);

    console.log('Fetching notification groups...');
    let groups = [];
    try {
        const response = await novu.notificationGroups.get();
        groups = response.data?.data || [];
    } catch (e) {
        console.error('Error fetching notification groups:', e.message);
    }

    let generalGroup = groups.find(g => g.name === 'General' || g.name === 'Default');
    if (!generalGroup && groups.length > 0) {
        generalGroup = groups[0];
    } else if (!generalGroup) {
        console.log('Creating General notification group...');
        try {
            const response = await novu.notificationGroups.create('General');
            generalGroup = response.data?.data || response.data;
        } catch (e) {
            console.error('Error creating notification group:', e.message);
            process.exit(1);
        }
    }

    console.log(`Using notification group: ${generalGroup.name} (${generalGroup._id})`);

    console.log('Fetching existing workflows...');
    let existingTemplates = [];
    try {
        const response = await novu.notificationTemplates.getAll();
        existingTemplates = response.data?.data || [];
    } catch (e) {
        console.error('Error fetching workflows:', e.message);
    }

    const workflowMappings = {
        [NOTIFICATION_TYPES.TASK_ASSIGNED]: 'task-assigned',
        [NOTIFICATION_TYPES.TASK_UPDATED]: 'task-updated',
        [NOTIFICATION_TYPES.TASK_DELETED]: 'task-deleted',
        [NOTIFICATION_TYPES.TASK_COMPLETED]: 'task-completed',
        [NOTIFICATION_TYPES.TASK_COMMENTED]: 'task-commented',
        [NOTIFICATION_TYPES.TASK_MENTIONED]: 'task-mentioned',
        [NOTIFICATION_TYPES.WORKSPACE_INVITE]: 'workspace-invite',
        [NOTIFICATION_TYPES.WORKSPACE_JOINED]: 'workspace-joined',
        [NOTIFICATION_TYPES.WORKSPACE_LEFT]: 'workspace-left',
        [NOTIFICATION_TYPES.WORKSPACE_ROLE_CHANGED]: 'workspace-role-changed',
        [NOTIFICATION_TYPES.COMMENT_CREATED]: 'comment-created',
        [NOTIFICATION_TYPES.COMMENT_UPDATED]: 'comment-updated',
        [NOTIFICATION_TYPES.COMMENT_DELETED]: 'comment-deleted',
        [NOTIFICATION_TYPES.COMMENT_LIKED]: 'comment-liked',
        [NOTIFICATION_TYPES.COMMENT_MENTIONED]: 'comment-mentioned',
        [NOTIFICATION_TYPES.USER_MENTIONED]: 'user-mentioned',
    };

    for (const [type, slug] of Object.entries(workflowMappings)) {
        const existing = existingTemplates.find(t => t.triggers[0].identifier === slug);
        
        if (existing) {
            console.log(`Workflow already exists: ${slug}`);
            continue;
        }

        const data = NOTIFICATION_DATA[type] || { title: type, message: `New notification: ${type}` };
        
        console.log(`Creating workflow: ${slug} (${data.title})...`);
        
        try {
            await novu.notificationTemplates.create({
                name: data.title,
                notificationGroupId: generalGroup._id,
                active: true,
                draft: false,
                critical: false,
                triggers: [{ identifier: slug, type: 'event' }],
                steps: [
                    {
                        template: {
                            type: 'in_app',
                            content: '{{message}}',
                        },
                        active: true
                    },
                    {
                        template: {
                            type: 'email',
                            subject: data.title,
                            content: 'Hi {{firstName}},<br/><br/>{{message}}<br/><br/>Check it out on TaskGid.',
                        },
                        active: true
                    }
                ]
            });
            console.log(`Successfully created workflow: ${slug}`);
        } catch (error) {
            console.error(`Failed to create workflow ${slug}:`, error.message);
            if (error.response?.data) {
                console.error('Details:', JSON.stringify(error.response.data));
            }
        }
    }

    console.log('Novu sync completed!');
}

syncNovu();
