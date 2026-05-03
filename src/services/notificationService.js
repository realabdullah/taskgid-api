import { Novu } from "@novu/node";
import "dotenv/config";
import Pusher from "pusher";
import { NOTIFICATION_TYPES } from "../constants/notificationTypes.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import { validateNotificationData } from "../utils/notificationValidator.js";

/**
 * Notification Service class to handle real-time notifications and Novu workflows
 */
class NotificationService {
  /**
   * Initialize the notification service
   */
  constructor() {
    this.pusher = null;
    this.novu = null;
    this.initialize();
  }

  /**
   * Setup Pusher and Novu instances
   */
  initialize() {
    // Initialize Pusher
    if (
      !process.env.PUSHER_APP_ID ||
      !process.env.PUSHER_KEY ||
      !process.env.PUSHER_SECRET ||
      !process.env.PUSHER_CLUSTER
    ) {
      console.warn("Pusher configuration is incomplete");
    } else {
      try {
        this.pusher = new Pusher({
          appId: process.env.PUSHER_APP_ID,
          key: process.env.PUSHER_KEY,
          secret: process.env.PUSHER_SECRET,
          cluster: process.env.PUSHER_CLUSTER,
          useTLS: true,
        });
      } catch (error) {
        console.error("Pusher initialization failed:", error);
      }
    }

    // Initialize Novu
    if (!process.env.NOVU_API_KEY) {
      console.warn("Novu configuration is incomplete");
    } else {
      try {
        this.novu = new Novu(process.env.NOVU_API_KEY);
      } catch (error) {
        console.error("Novu initialization failed:", error);
      }
    }
  }

  /**
   * Maps internal notification types to database enum values
   * @param {string} type - Internal notification type
   * @return {string} Database enum value
   */
  mapNotificationTypeToEnum(type) {
    const typeMap = {
      [NOTIFICATION_TYPES.TASK_ASSIGNED]: "task_assigned",
      [NOTIFICATION_TYPES.TASK_UPDATED]: "task_updated",
      [NOTIFICATION_TYPES.TASK_DELETED]: "task_deleted",
      [NOTIFICATION_TYPES.TASK_COMPLETED]: "task_completed",
      [NOTIFICATION_TYPES.TASK_COMMENTED]: "comment_reply",
      [NOTIFICATION_TYPES.COMMENT_CREATED]: "comment_reply",
      [NOTIFICATION_TYPES.COMMENT_UPDATED]: "comment_reply",
      [NOTIFICATION_TYPES.COMMENT_DELETED]: "comment_reply",
      [NOTIFICATION_TYPES.COMMENT_LIKED]: "comment_like",
      [NOTIFICATION_TYPES.USER_MENTIONED]: "mention",
      [NOTIFICATION_TYPES.TASK_MENTIONED]: "mention",
      [NOTIFICATION_TYPES.COMMENT_MENTIONED]: "mention",
      [NOTIFICATION_TYPES.WORKSPACE_INVITE]: "workspace_invite",
      [NOTIFICATION_TYPES.WORKSPACE_INVITE_DECLINED]: "workspace_invite_declined",
      [NOTIFICATION_TYPES.WORKSPACE_ROLE_CHANGED]: "workspace_role_changed",
    };
    return typeMap[type] || "task_updated";
  }

  /**
   * Validates if a string is a valid UUID
   * @param {string} uuid - The string to validate
   * @return {boolean} True if valid UUID
   */
  isValidUUID(uuid) {
    if (!uuid) return false;
    const regex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return regex.test(uuid);
  }

  /**
   * Generates a default notification message based on the event type
   * @param {string} event - The notification event type
   * @param {Object} data - Context data for the notification
   * @return {string} The generated message
   */
  generateDefaultMessage(event, data) {
    try {
      switch (event) {
        case NOTIFICATION_TYPES.TASK_ASSIGNED:
          return data.assignerName && data.taskTitle
            ? `${data.assignerName} assigned you a task: ${data.taskTitle}`
            : "You were assigned a new task";
        case NOTIFICATION_TYPES.TASK_UPDATED:
          return data.updaterName && data.taskTitle
            ? `${data.updaterName} updated task: ${data.taskTitle}`
            : "A task was updated";
        case NOTIFICATION_TYPES.TASK_COMPLETED:
          return data.taskTitle
            ? `Task completed: ${data.taskTitle}`
            : "A task was completed";
        case NOTIFICATION_TYPES.COMMENT_CREATED:
          return data.commenterName && data.taskTitle
            ? `${data.commenterName} commented on: ${data.taskTitle}`
            : "New comment on a task";
        case NOTIFICATION_TYPES.USER_MENTIONED:
          return data.mentionerName && data.contextType
            ? `${data.mentionerName} mentioned you in a ${data.contextType}`
            : "You were mentioned";
        case NOTIFICATION_TYPES.WORKSPACE_INVITE:
          return data.inviterName && data.workspaceName
            ? `${data.inviterName} invited you to workspace: ${data.workspaceName}`
            : "You were invited to a workspace";
        case NOTIFICATION_TYPES.WORKSPACE_INVITE_DECLINED:
          return data.userName && data.workspaceName
            ? `${data.userName} declined the invitation to ${data.workspaceName}`
            : "An invitation was declined";
        case NOTIFICATION_TYPES.WORKSPACE_JOINED:
          return data.userName && data.workspaceName
            ? `${data.userName} joined the workspace: ${data.workspaceName}`
            : "A new member joined the workspace";
        default:
          return `New notification (${event})`;
      }
    } catch (error) {
      console.error("Error generating notification message:", error);
      return `New notification (${event})`;
    }
  }

  /**
   * Stores a notification in the database
   * @param {string} userId - ID of the user receiving the notification
   * @param {string} event - The notification event type
   * @param {Object} data - Additional data to store
   * @param {Object} [transaction] - Optional Sequelize transaction
   * @return {Promise<Object|null>} The created notification or null on error
   */
  async storeNotification(userId, event, data, transaction = null) {
    try {
      validateNotificationData(event, data);

      const message =
        data.message ||
        this.generateDefaultMessage(event, data) ||
        `New notification (${event})`;
      const dbType = this.mapNotificationTypeToEnum(event);

      const notificationData = {
        userId,
        type: dbType,
        read: false,
        message,
      };

      if (data.taskId && this.isValidUUID(data.taskId)) {
        notificationData.taskId = data.taskId;
      }

      if (data.commentId && this.isValidUUID(data.commentId)) {
        notificationData.commentId = data.commentId;
      } else if (
        data.contextType === "comment" &&
        data.contextId &&
        this.isValidUUID(data.contextId)
      ) {
        notificationData.commentId = data.contextId;
      }

      const actorId =
        data.assignerId ||
        data.updaterId ||
        data.commenterId ||
        data.mentionerId ||
        data.inviterId ||
        data.actorId;
      if (actorId && this.isValidUUID(actorId)) {
        notificationData.actorId = actorId;
      }

      const notification = await Notification.create(notificationData, {
        transaction,
      });
      return notification;
    } catch (error) {
      console.error("Error storing notification:", error);
      return null;
    }
  }

  /**
   * Maps an event type to a Novu workflow ID
   * @param {string} eventType - The notification event type
   * @return {string} Novu workflow ID
   */
  mapEventToNovuWorkflow(eventType) {
    const mappings = {
      [NOTIFICATION_TYPES.TASK_ASSIGNED]: "new-task-assigned",
      [NOTIFICATION_TYPES.TASK_UPDATED]: "task-updated",
      [NOTIFICATION_TYPES.TASK_DELETED]: "task-deleted",
      [NOTIFICATION_TYPES.TASK_COMPLETED]: "task-completed",
      [NOTIFICATION_TYPES.TASK_COMMENTED]: "task-commented",
      [NOTIFICATION_TYPES.TASK_MENTIONED]: "task-mentioned",
      [NOTIFICATION_TYPES.WORKSPACE_INVITE]: "workspace-invitation",
      [NOTIFICATION_TYPES.WORKSPACE_INVITE_DECLINED]: "workspace-invite-declined",
      [NOTIFICATION_TYPES.WORKSPACE_JOINED]: "new-workspace-member",
      [NOTIFICATION_TYPES.WORKSPACE_LEFT]: "member-left-workspace",
      [NOTIFICATION_TYPES.WORKSPACE_ROLE_CHANGED]: "workspace-role-updated",
      [NOTIFICATION_TYPES.COMMENT_CREATED]: "new-comment",
      [NOTIFICATION_TYPES.COMMENT_UPDATED]: "comment-updated",
      [NOTIFICATION_TYPES.COMMENT_DELETED]: "comment-deleted",
      [NOTIFICATION_TYPES.COMMENT_LIKED]: "comment-liked",
      [NOTIFICATION_TYPES.COMMENT_MENTIONED]: "mentioned-in-comment",
      [NOTIFICATION_TYPES.USER_MENTIONED]: "you-were-mentioned",
    };
    return mappings[eventType] || null;
  }

  /**
   * Sends a notification through all configured channels
   * @param {string} userId - Target user ID
   * @param {string} event - Notification event type
   * @param {Object} data - Notification context data
   * @param {Object} [options] - Additional options like transaction
   * @return {Promise<void>}
   */
  async sendNotification(userId, event, data, options = {}) {
    try {
      const notification = await this.storeNotification(
        userId,
        event,
        data,
        options.transaction,
      );

      const finalData = {
        ...data,
        message:
          notification?.message ||
          data.message ||
          this.generateDefaultMessage(event, data),
      };

      // 1. Pusher for real-time updates (e.g., live comments on the frontend)
      if (this.pusher) {
        await this.sendPusherNotification(userId, event, finalData);
      }

      // 2. Novu for product notifications (Bell icon, emails)
      if (this.novu) {
        await this.sendNovuNotification(userId, event, finalData);
      }
    } catch (error) {
      console.error("Notification sending failed:", error);
    }
  }

  /**
   * Sends a real-time notification via Pusher
   * @param {string} userId - Target user ID
   * @param {string} event - Notification event type
   * @param {Object} data - Notification data
   * @return {Promise<void>}
   */
  async sendPusherNotification(userId, event, data) {
    if (!this.pusher) return;
    const channel = `private-user-${userId}`;
    await this.pusher.trigger(channel, event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Sends a product notification via Novu
   * @param {string} userId - Target user ID
   * @param {string} event - Notification event type
   * @param {Object} data - Notification data
   * @return {Promise<void>}
   */
  async sendNovuNotification(userId, event, data) {
    if (!this.novu) return;

    const user = await User.findByPk(userId);
    if (!user) {
      console.error(`User ${userId} not found for Novu notification`);
      return;
    }

    const workflowId = this.mapEventToNovuWorkflow(event);
    if (!workflowId) {
      console.warn(`No Novu workflow mapped for event ${event}`);
      return;
    }

    try {
      await this.novu.trigger(workflowId, {
        to: {
          subscriberId: userId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        payload: {
          ...data,
          event_type: event,
        },
      });
    } catch (error) {
      console.error(`Novu trigger failed for workflow ${workflowId}:`, error);
    }
  }

  /**
   * Sends a notification to multiple users
   * @param {Array<string>} userIds - Array of target user IDs
   * @param {string} event - Notification event type
   * @param {Object} data - Notification context data
   * @param {Object} [options] - Additional options
   * @return {Promise<void>}
   */
  async sendBulkNotification(userIds, event, data, options = {}) {
    try {
      const validUserIds = userIds.filter((id) => this.isValidUUID(id));
      const notificationPromises = validUserIds.map((userId) =>
        this.sendNotification(userId, event, data, options).catch((error) => {
          console.error(
            `Failed to send notification to user ${userId}:`,
            error,
          );
          return null;
        }),
      );
      await Promise.all(notificationPromises);
    } catch (error) {
      console.error("Bulk notification sending failed:", error);
    }
  }
  /**
   * Sends task assignment notifications to all assignees
   * @param {string} taskId - ID of the task
   * @param {string} taskTitle - Title of the task
   * @param {string} assignerId - ID of the user who assigned the task
   * @param {string} assignerName - Name of the assigner
   * @param {Array<string>} assigneeIds - Array of IDs of users assigned to the task
   * @return {Promise<void>}
   */
  async sendTaskAssignmentNotification(
    taskId,
    taskTitle,
    assignerId,
    assignerName,
    assigneeIds,
  ) {
    if (!assigneeIds || assigneeIds.length === 0) return;

    const data = {
      taskId,
      taskTitle,
      assignerId,
      assignerName,
    };

    await this.sendBulkNotification(
      assigneeIds,
      NOTIFICATION_TYPES.TASK_ASSIGNED,
      data,
    );
  }
}

export default new NotificationService();
