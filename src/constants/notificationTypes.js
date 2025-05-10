/**
 * Notification event types and their data structures
 */
export const NOTIFICATION_TYPES = {
    // Task related notifications
    TASK_ASSIGNED: 'task-assigned',
    TASK_UPDATED: 'task-updated',
    TASK_DELETED: 'task-deleted',
    TASK_COMPLETED: 'task-completed',
    TASK_COMMENTED: 'task-commented',
    TASK_MENTIONED: 'task-mentioned',

    // Workspace related notifications
    WORKSPACE_INVITE: 'workspace-invite',
    WORKSPACE_JOINED: 'workspace-joined',
    WORKSPACE_LEFT: 'workspace-left',
    WORKSPACE_ROLE_CHANGED: 'workspace-role-changed',

    // Comment related notifications
    COMMENT_CREATED: 'comment-created',
    COMMENT_UPDATED: 'comment-updated',
    COMMENT_DELETED: 'comment-deleted',
    COMMENT_LIKED: 'comment-liked',
    COMMENT_MENTIONED: 'comment-mentioned',

    // User related notifications
    USER_MENTIONED: 'user-mentioned',
};

/**
 * Notification data structures for each type
 */
export const NOTIFICATION_DATA = {
    [NOTIFICATION_TYPES.TASK_ASSIGNED]: {
        title: 'Task Assigned',
        message: 'You have been assigned to a task',
        requiredFields: ['taskId', 'taskTitle', 'assignerId', 'assignerName'],
    },
    [NOTIFICATION_TYPES.TASK_UPDATED]: {
        title: 'Task Updated',
        message: 'A task has been updated',
        requiredFields: ['taskId', 'taskTitle', 'updaterId', 'updaterName'],
    },
    [NOTIFICATION_TYPES.TASK_DELETED]: {
        title: 'Task Deleted',
        message: 'A task has been deleted',
        requiredFields: ['taskId', 'taskTitle', 'deleterId', 'deleterName'],
    },
    [NOTIFICATION_TYPES.TASK_COMPLETED]: {
        title: 'Task Completed',
        message: 'A task has been marked as completed',
        requiredFields: ['taskId', 'taskTitle', 'completerId', 'completerName'],
    },
    [NOTIFICATION_TYPES.TASK_COMMENTED]: {
        title: 'New Comment',
        message: 'A new comment has been added to a task',
        requiredFields: ['taskId', 'taskTitle', 'commentId', 'commenterId', 'commenterName'],
    },
    [NOTIFICATION_TYPES.TASK_MENTIONED]: {
        title: 'Task Mention',
        message: 'You have been mentioned in a task',
        requiredFields: ['taskId', 'taskTitle', 'mentionerId', 'mentionerName'],
    },
    [NOTIFICATION_TYPES.WORKSPACE_INVITE]: {
        title: 'Workspace Invitation',
        message: 'You have been invited to join a workspace',
        requiredFields: ['workspaceId', 'workspaceName', 'inviterId', 'inviterName'],
    },
    [NOTIFICATION_TYPES.WORKSPACE_JOINED]: {
        title: 'New Workspace Member',
        message: 'A new member has joined the workspace',
        requiredFields: ['workspaceId', 'workspaceName', 'userId', 'userName'],
    },
    [NOTIFICATION_TYPES.WORKSPACE_LEFT]: {
        title: 'Member Left',
        message: 'A member has left the workspace',
        requiredFields: ['workspaceId', 'workspaceName', 'userId', 'userName'],
    },
    [NOTIFICATION_TYPES.WORKSPACE_ROLE_CHANGED]: {
        title: 'Role Changed',
        message: 'Your role in the workspace has been changed',
        requiredFields: ['workspaceId', 'workspaceName', 'newRole', 'changerId', 'changerName'],
    },
    [NOTIFICATION_TYPES.COMMENT_CREATED]: {
        title: 'New Comment',
        message: 'A new comment has been added',
        requiredFields: ['commentId', 'commenterId', 'commenterName', 'taskId', 'taskTitle'],
    },
    [NOTIFICATION_TYPES.COMMENT_UPDATED]: {
        title: 'Comment Updated',
        message: 'A comment has been updated',
        requiredFields: ['commentId', 'updaterId', 'updaterName', 'taskId', 'taskTitle'],
    },
    [NOTIFICATION_TYPES.COMMENT_DELETED]: {
        title: 'Comment Deleted',
        message: 'A comment has been deleted',
        requiredFields: ['commentId', 'deleterId', 'deleterName', 'taskId', 'taskTitle'],
    },
    [NOTIFICATION_TYPES.COMMENT_LIKED]: {
        title: 'Comment Liked',
        message: 'Someone liked your comment',
        requiredFields: ['commentId', 'likerId', 'likerName', 'taskId', 'taskTitle'],
    },
    [NOTIFICATION_TYPES.COMMENT_MENTIONED]: {
        title: 'Comment Mention',
        message: 'You have been mentioned in a comment',
        requiredFields: ['commentId', 'mentionerId', 'mentionerName', 'taskId', 'taskTitle'],
    },
    [NOTIFICATION_TYPES.USER_MENTIONED]: {
        title: 'User Mention',
        message: 'You have been mentioned',
        requiredFields: ['mentionerId', 'mentionerName', 'contextId', 'contextType'],
    },
};
