import Pusher from 'pusher';
import admin from 'firebase-admin';
import 'dotenv/config';
import Knock from '@knocklabs/node';
import User from '../models/User.js';
import {NOTIFICATION_TYPES} from '../constants/notificationTypes.js';
import {validateNotificationData} from '../utils/notificationValidator.js';
import Notification from '../models/Notification.js';

/**
 * Notification Service class to handle real-time notifications
 * Supports Pusher, Firebase Cloud Messaging, and Knock Labs (one at a time)
 */
class NotificationService {
    /**
   * Creates a new NotificationService instance
   */
    constructor() {
        this.pusher = null;
        this.firebaseApp = null;
        this.knockClient = null;
        this.provider = process.env.NOTIFICATION_PROVIDER || 'pusher';
        this.initialize();
    }

    /**
   * Initialize notification services
   */
    initialize() {
        if (this.provider === 'pusher') {
            if (
                !process.env.PUSHER_APP_ID ||
        !process.env.PUSHER_KEY ||
        !process.env.PUSHER_SECRET ||
        !process.env.PUSHER_CLUSTER
            ) {
                console.warn('Pusher configuration is incomplete');
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
                    console.error('Pusher initialization failed:', error);
                }
            }
        }

        if (this.provider === 'firebase') {
            if (
                !process.env.FIREBASE_PROJECT_ID ||
        !process.env.FIREBASE_CLIENT_EMAIL ||
        !process.env.FIREBASE_PRIVATE_KEY
            ) {
                console.warn('Firebase configuration is incomplete');
            } else {
                try {
                    if (!admin.apps.length) {
                        this.firebaseApp = admin.initializeApp({
                            credential: admin.credential.cert({
                                projectId: process.env.FIREBASE_PROJECT_ID,
                                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(
                                    /\\n/g,
                                    '\n',
                                ),
                            }),
                        });
                    } else {
                        this.firebaseApp = admin.app();
                    }
                } catch (error) {
                    console.error('Firebase initialization failed:', error);
                }
            }
        }

        if (this.provider === 'knock') {
            if (!process.env.KNOCK_API_KEY) {
                console.warn('Knock configuration is incomplete');
            } else {
                try {
                    this.knockClient = new Knock({
                        apiKey: process.env.KNOCK_API_KEY,
                    });
                } catch (error) {
                    console.error('Knock initialization failed:', error);
                }
            }
        }
    }

    /**
   * Maps API notification types to database enum values
   * @param {string} type - The notification type from constants
   * @return {string} The mapped database enum value
   */
    mapNotificationTypeToEnum(type) {
        const typeMap = {
            [NOTIFICATION_TYPES.TASK_ASSIGNED]: 'task_assigned',
            [NOTIFICATION_TYPES.TASK_UPDATED]: 'task_updated',
            [NOTIFICATION_TYPES.TASK_DELETED]: 'task_deleted',
            [NOTIFICATION_TYPES.TASK_COMPLETED]: 'task_completed',
            [NOTIFICATION_TYPES.TASK_COMMENTED]: 'comment_reply',
            [NOTIFICATION_TYPES.COMMENT_CREATED]: 'comment_reply',
            [NOTIFICATION_TYPES.COMMENT_UPDATED]: 'comment_reply',
            [NOTIFICATION_TYPES.COMMENT_DELETED]: 'comment_reply',
            [NOTIFICATION_TYPES.COMMENT_LIKED]: 'comment_like',
            [NOTIFICATION_TYPES.USER_MENTIONED]: 'mention',
            [NOTIFICATION_TYPES.TASK_MENTIONED]: 'mention',
            [NOTIFICATION_TYPES.COMMENT_MENTIONED]: 'mention',
            [NOTIFICATION_TYPES.WORKSPACE_INVITE]: 'workspace_invite',
            [NOTIFICATION_TYPES.WORKSPACE_ROLE_CHANGED]: 'workspace_role_changed',
        };

        return typeMap[type] || 'task_updated';
    }

    /**
   * Store notification in database
   * @param {string} userId - The ID of the user to notify
   * @param {string} event - The event type
   * @param {object} data - The notification data
   * @param {object} [transaction=null] - Optional Sequelize transaction
   * @return {Promise<object>} The stored notification
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
            } else if (data.contextType === 'comment' && data.contextId && this.isValidUUID(data.contextId)) {
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

            const notification = await Notification.create(notificationData, {transaction});
            return notification;
        } catch (error) {
            console.error('Error storing notification:', error);
            if (error.name === 'SequelizeForeignKeyConstraintError') {
                console.error(`Foreign key error details:`, {
                    constraint: error.index,
                    table: error.table,
                    userId,
                    event,
                    dataIds: {
                        taskId: data.taskId,
                        commentId: data.commentId,
                        actorId:
                            data.assignerId ||
                            data.updaterId ||
                            data.commenterId ||
                            data.mentionerId ||
                            data.inviterId ||
                            data.actorId,
                    },
                });
            }

            return null;
        }
    }

    /**
   * Check if a UUID string is valid
   * @param {string} uuid - The UUID string to validate
   * @return {boolean} Whether the UUID is valid
   */
    isValidUUID(uuid) {
        if (!uuid) return false;
        const regex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return regex.test(uuid);
    }

    /**
   * Generate a default message for a notification when one isn't provided
   * @param {string} event - The event type
   * @param {object} data - The notification data
   * @return {string} Generated message
   */
    generateDefaultMessage(event, data) {
        try {
            switch (event) {
            case NOTIFICATION_TYPES.TASK_ASSIGNED:
                return data.assignerName && data.taskTitle ?
                    `${data.assignerName} assigned you a task: ${data.taskTitle}` :
                    'You were assigned a new task';
            case NOTIFICATION_TYPES.TASK_UPDATED:
                return data.updaterName && data.taskTitle ?
                    `${data.updaterName} updated task: ${data.taskTitle}` :
                    'A task was updated';
            case NOTIFICATION_TYPES.TASK_COMPLETED:
                return data.taskTitle ?
                    `Task completed: ${data.taskTitle}` :
                    'A task was completed';
            case NOTIFICATION_TYPES.COMMENT_CREATED:
                return data.commenterName && data.taskTitle ?
                    `${data.commenterName} commented on: ${data.taskTitle}` :
                    'New comment on a task';
            case NOTIFICATION_TYPES.USER_MENTIONED:
                return data.mentionerName && data.contextType ?
                    `${data.mentionerName} mentioned you in a ${data.contextType}` :
                    'You were mentioned';
            case NOTIFICATION_TYPES.WORKSPACE_INVITE:
                return data.inviterName && data.workspaceName ?
                    `${data.inviterName} invited you to workspace: ${data.workspaceName}` :
                    'You were invited to a workspace';
            default:
                return `New notification (${event})`;
            }
        } catch (error) {
            console.error('Error generating notification message:', error);
            return `New notification (${event})`;
        }
    }

    /**
   * Send a notification to a specific user
   * @param {string} userId - The ID of the user to notify
   * @param {string} event - The event type
   * @param {object} data - The notification data
   * @param {object} options - Additional options for notifications
   */
    async sendNotification(userId, event, data, options = {}) {
        try {
            await this.storeNotification(userId, event, data, options.transaction);

            switch (this.provider) {
            case 'pusher':
                if (this.pusher) {
                    await this.sendPusherNotification(userId, event, data);
                } else {
                    console.warn('Pusher is not initialized but is set as provider');
                }
                break;
            case 'firebase':
                if (this.firebaseApp) {
                    try {
                        await this.sendFirebaseNotification(userId, event, data, options);
                    } catch (error) {
                        console.error('Firebase notification failed:', error);
                    }
                } else {
                    console.warn('Firebase is not initialized but is set as provider');
                }
                break;
            case 'knock':
                if (this.knockClient) {
                    await this.sendKnockNotification(userId, event, data);
                } else {
                    console.warn('Knock is not initialized but is set as provider');
                }
                break;
            default:
                console.warn(`Unsupported notification provider: ${this.provider}`);
            }
        } catch (error) {
            console.error('Notification sending failed:', error);
        }
    }

    /**
   * Send notification via Pusher
   * @param {string} userId - The ID of the user to notify
   * @param {string} event - The event type
   * @param {object} data - The notification data
   */
    async sendPusherNotification(userId, event, data) {
        if (!this.pusher) {
            throw new Error('Pusher is not configured');
        }

        const channel = `private-user-${userId}`;
        await this.pusher.trigger(channel, event, {
            ...data,
            timestamp: new Date().toISOString(),
        });
    }

    /**
   * Send notification via Firebase
   * @param {string} userId - The ID of the user to notify
   * @param {string} event - The event type
   * @param {object} data - The notification data
   * @param {object} options - Additional Firebase notification options
   */
    async sendFirebaseNotification(userId, event, data, options = {}) {
        if (!this.firebaseApp) {
            throw new Error('Firebase is not configured');
        }

        const user = await User.findByPk(userId);
        if (!user?.fcmToken) {
            throw new Error(`No FCM token found for user ${userId}`);
        }

        const message = {
            token: user.fcmToken,
            notification: {
                title: data.title || 'New Notification',
                body: data.message || 'You have a new notification',
            },
            data: {
                event,
                ...Object.entries(data).reduce((acc, [key, value]) => {
                    // Firebase only accepts string values in data
                    acc[key] = typeof value === 'string' ? value : JSON.stringify(value);
                    return acc;
                }, {}),
                timestamp: new Date().toISOString(),
            },
            ...options,
        };

        await admin.messaging().send(message);
    }

    /**
   * Send notification via Knock
   * @param {string} userId - The ID of the user to notify
   * @param {string} event - The event type
   * @param {object} data - The notification data
   */
    async sendKnockNotification(userId, event, data) {
        if (!this.knockClient) {
            throw new Error('Knock is not configured');
        }

        const user = await User.findByPk(userId);
        if (!user) {
            throw new Error(`User ${userId} not found`);
        }

        await this.knockClient.users.identify(userId, {
            email: user.email,
            name:
        `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
        user.username,
            properties: {
                username: user.username,
                profilePicture: user.profilePicture,
            },
        });

        const workflowKey = this.mapEventToKnockWorkflow(event);
        if (!workflowKey) {
            console.warn(`No Knock workflow mapped for event ${event}`);
            return;
        }

        await this.knockClient.workflows.trigger(workflowKey, {
            recipients: [userId],
            data: {
                ...data,
                event_type: event,
                timestamp: new Date().toISOString(),
            },
        });
    }

    /**
   * Map TaskGid event type to Knock workflow key
   * @param {string} eventType - The TaskGid event type
   * @return {string|null} The corresponding Knock workflow key or null if no mapping
   */
    mapEventToKnockWorkflow(eventType) {
    // This mapping should be configured based on your Knock workflows
        const mappings = {
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

        return mappings[eventType] || null;
    }

    /**
   * Send notification to multiple users
   * @param {string[]} userIds - Array of user IDs to notify
   * @param {string} event - The event type
   * @param {object} data - The notification data
   * @param {object} options - Additional options for notifications
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
            console.error('Bulk notification sending failed:', error);
        }
    }
}

export default new NotificationService();
