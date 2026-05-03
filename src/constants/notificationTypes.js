/**
 * Notification event types and their data structures
 */
export const NOTIFICATION_TYPES = {
  // Task related notifications
  TASK_ASSIGNED: "task-assigned",
  TASK_UPDATED: "task-updated",
  TASK_DELETED: "task-deleted",
  TASK_COMPLETED: "task-completed",
  TASK_COMMENTED: "task-commented",
  TASK_MENTIONED: "task-mentioned",

  // Workspace related notifications
  WORKSPACE_INVITE: "workspace-invite",
  WORKSPACE_INVITE_DECLINED: "workspace-invite-declined",
  WORKSPACE_JOINED: "workspace-joined",
  WORKSPACE_LEFT: "workspace-left",
  WORKSPACE_ROLE_CHANGED: "workspace-role-changed",

  // Comment related notifications
  COMMENT_CREATED: "comment-created",
  COMMENT_UPDATED: "comment-updated",
  COMMENT_DELETED: "comment-deleted",
  COMMENT_LIKED: "comment-liked",
  COMMENT_MENTIONED: "comment-mentioned",

  // User related notifications
  USER_MENTIONED: "user-mentioned",
};

/**
 * Notification data structures for each type
 */
export const NOTIFICATION_DATA = {
  [NOTIFICATION_TYPES.TASK_ASSIGNED]: {
    title: "New Task Assigned",
    message: "{{assignerName}} assigned you to a task: {{taskTitle}}",
    requiredFields: ["taskId", "taskTitle", "assignerId", "assignerName"],
  },
  [NOTIFICATION_TYPES.TASK_UPDATED]: {
    title: "Task Updated",
    message: "{{updaterName}} updated task: {{taskTitle}}",
    requiredFields: ["taskId", "taskTitle", "updaterId", "updaterName"],
  },
  [NOTIFICATION_TYPES.TASK_DELETED]: {
    title: "Task Deleted",
    message: "{{deleterName}} deleted task: {{taskTitle}}",
    requiredFields: ["taskId", "taskTitle", "deleterId", "deleterName"],
  },
  [NOTIFICATION_TYPES.TASK_COMPLETED]: {
    title: "Task Completed",
    message: "{{completerName}} marked task as completed: {{taskTitle}}",
    requiredFields: ["taskId", "taskTitle", "completerId", "completerName"],
  },
  [NOTIFICATION_TYPES.TASK_COMMENTED]: {
    title: "New Task Comment",
    message: "{{commenterName}} commented on task: {{taskTitle}}",
    requiredFields: [
      "taskId",
      "taskTitle",
      "commentId",
      "commenterId",
      "commenterName",
    ],
  },
  [NOTIFICATION_TYPES.TASK_MENTIONED]: {
    title: "Mentioned in Task",
    message: "{{mentionerName}} mentioned you in task: {{taskTitle}}",
    requiredFields: ["taskId", "taskTitle", "mentionerId", "mentionerName"],
  },
  [NOTIFICATION_TYPES.WORKSPACE_INVITE]: {
    title: "Workspace Invitation",
    message: "{{inviterName}} invited you to join {{workspaceName}}",
    requiredFields: [
      "workspaceId",
      "workspaceName",
      "inviterId",
      "inviterName",
    ],
  },
  [NOTIFICATION_TYPES.WORKSPACE_INVITE_DECLINED]: {
    title: "Invitation Declined",
    message: "{{userName}} declined the invitation to {{workspaceName}}",
    requiredFields: ["workspaceId", "workspaceName", "userId", "userName"],
  },
  [NOTIFICATION_TYPES.WORKSPACE_JOINED]: {
    title: "New Workspace Member",
    message: "{{userName}} joined the workspace: {{workspaceName}}",
    requiredFields: ["workspaceId", "workspaceName", "userId", "userName"],
  },
  [NOTIFICATION_TYPES.WORKSPACE_LEFT]: {
    title: "Member Left Workspace",
    message: "{{userName}} left the workspace: {{workspaceName}}",
    requiredFields: ["workspaceId", "workspaceName", "userId", "userName"],
  },
  [NOTIFICATION_TYPES.WORKSPACE_ROLE_CHANGED]: {
    title: "Workspace Role Updated",
    message:
      "{{changerName}} updated your role to {{newRole}} in {{workspaceName}}",
    requiredFields: [
      "workspaceId",
      "workspaceName",
      "newRole",
      "changerId",
      "changerName",
    ],
  },
  [NOTIFICATION_TYPES.COMMENT_CREATED]: {
    title: "New Comment",
    message: "{{commenterName}} added a comment to: {{taskTitle}}",
    requiredFields: [
      "commentId",
      "commenterId",
      "commenterName",
      "taskId",
      "taskTitle",
    ],
  },
  [NOTIFICATION_TYPES.COMMENT_UPDATED]: {
    title: "Comment Updated",
    message: "{{updaterName}} updated a comment in: {{taskTitle}}",
    requiredFields: [
      "commentId",
      "updaterId",
      "updaterName",
      "taskId",
      "taskTitle",
    ],
  },
  [NOTIFICATION_TYPES.COMMENT_DELETED]: {
    title: "Comment Deleted",
    message: "{{deleterName}} deleted a comment in: {{taskTitle}}",
    requiredFields: [
      "commentId",
      "deleterId",
      "deleterName",
      "taskId",
      "taskTitle",
    ],
  },
  [NOTIFICATION_TYPES.COMMENT_LIKED]: {
    title: "Comment Liked",
    message: "{{likerName}} liked your comment in: {{taskTitle}}",
    requiredFields: [
      "commentId",
      "likerId",
      "likerName",
      "taskId",
      "taskTitle",
    ],
  },
  [NOTIFICATION_TYPES.COMMENT_MENTIONED]: {
    title: "Mentioned in Comment",
    message: "{{mentionerName}} mentioned you in a comment in: {{taskTitle}}",
    requiredFields: [
      "commentId",
      "mentionerId",
      "mentionerName",
      "taskId",
      "taskTitle",
    ],
  },
  [NOTIFICATION_TYPES.USER_MENTIONED]: {
    title: "You were Mentioned",
    message: "{{mentionerName}} mentioned you",
    requiredFields: [
      "mentionerId",
      "mentionerName",
      "contextId",
      "contextType",
    ],
  },
};
