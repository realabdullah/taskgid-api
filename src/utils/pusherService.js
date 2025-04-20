import Pusher from 'pusher';
import 'dotenv/config';

// Validate essential Pusher config
if (!process.env.PUSHER_APP_ID ||
    !process.env.PUSHER_KEY ||
    !process.env.PUSHER_SECRET ||
    !process.env.PUSHER_CLUSTER) {
    console.warn('Pusher environment variables are not fully configured. Real-time notifications will be disabled.');
    // Provide a mock or no-op implementation if needed
}

// Initialize Pusher client
const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID || '',
    key: process.env.PUSHER_KEY || '',
    secret: process.env.PUSHER_SECRET || '',
    cluster: process.env.PUSHER_CLUSTER || '',
    useTLS: true,
});

/**
 * Sends a notification when a user is mentioned in a comment.
 *
 * @param {string} mentionedUserId - The ID of the user who was mentioned.
 * @param {object} comment - The comment object (needs id, content).
 * @param {object} author - The user object of the comment author (needs id, firstName, username).
 * @param {object} task - The task object the comment belongs to (needs id, title).
 * @param {object} workspace - The workspace object (needs id, title).
 * @return {Promise<void>}
 */
const sendMentionNotification = async (mentionedUserId, comment, author, task, workspace) => {
    // Only proceed if Pusher seems configured
    if (!pusher.appId || !pusher.key || !pusher.secret || !pusher.cluster) {
        console.log('Pusher not configured, skipping mention notification.');
        return;
    }

    const channel = `private-user-${mentionedUserId}`;
    const event = 'comment-mention';
    const data = {
        message: `${author.firstName || author.username} mentioned you in a comment on task "${task.title}"`,
        commentId: comment.id,
        commentContentPreview: comment.content.substring(0, 100) + (comment.content.length > 100 ? '...' : ''),
        authorId: author.id,
        authorName: author.firstName || author.username,
        taskId: task.id,
        taskTitle: task.title,
        workspaceId: workspace.id,
        workspaceTitle: workspace.title,
        timestamp: new Date().toISOString(),
    };

    try {
        console.log(`Triggering Pusher event on channel ${channel} with event ${event}`);
        await pusher.trigger(channel, event, data);
    } catch (error) {
        console.error(`Failed to send Pusher notification to ${channel}:`, error);
        // Decide if you need more robust error handling/retry logic
    }
};

export {
    sendMentionNotification,
    // Add other Pusher-related functions here if needed
};
