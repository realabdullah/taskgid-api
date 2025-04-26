import Pusher from 'pusher';
import 'dotenv/config';

const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID,
    key: process.env.PUSHER_KEY,
    secret: process.env.PUSHER_SECRET,
    cluster: process.env.PUSHER_CLUSTER,
    useTLS: true,
});

const sendInviteNotification = (userId, workspace, sender, url) => {
    pusher.trigger(`user-${userId}`, 'workspace-invite', {
        workspace,
        sender,
        url,
    });
};

const acceptInviteNotification = (workspaceOwner, workspace, user) => {
    try {
        pusher.trigger(`workspace-${workspaceOwner}`, 'workspace-accepted', {
            title: workspace.title,
            slug: workspace.slug,
            user,
        });
    } catch (error) {
        console.error('Pusher error:', error);
    }
};

const sendTaskNotification = (userId, task, sender, url) => {
    pusher.trigger(`user-${userId}`, 'task-assigned', {
        task: task.title,
        sender,
        url,
    });
};

const sendTaskUpdateNotification = (userId, task, sender, url) => {
    pusher.trigger(`user-${userId}`, 'task-update', {
        task: task.title,
        sender,
        url,
    });
};

export {
    sendInviteNotification,
    sendTaskNotification,
    sendTaskUpdateNotification,
    acceptInviteNotification,
};
