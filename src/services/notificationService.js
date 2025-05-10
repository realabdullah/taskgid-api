import Pusher from 'pusher';
import admin from 'firebase-admin';
import 'dotenv/config';
import {User} from '../models';
import {Workspace} from '../models';
import {NOTIFICATION_TYPES} from '../constants/notificationTypes.js';
import {validateNotificationData} from '../utils/notificationValidator.js';
import Notification from '../models/Notification.js';

/**
 * Notification Service class to handle real-time notifications
 * Supports both Pusher and Firebase Cloud Messaging
 */
class NotificationService {
    /**
     * Creates a new NotificationService instance
     */
    constructor() {
        this.pusher = null;
        this.firebaseApp = null;
        this.provider = process.env.NOTIFICATION_PROVIDER || 'pusher';
        this.initialize();
    }

    /**
     * Initialize notification services
     */
    initialize() {
        // Initialize Pusher if configured
        if (this.provider === 'pusher' || this.provider === 'both') {
            if (!process.env.PUSHER_APP_ID || !process.env.PUSHER_KEY ||
                !process.env.PUSHER_SECRET || !process.env.PUSHER_CLUSTER) {
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

        // Initialize Firebase if configured
        if (this.provider === 'firebase' || this.provider === 'both') {
            if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_PRIVATE_KEY ||
                !process.env.FIREBASE_CLIENT_EMAIL) {
                console.warn('Firebase configuration is incomplete');
            } else {
                try {
                    // Check if Firebase is already initialized
                    try {
                        this.firebaseApp = admin.app();
                    } catch (error) {
                        this.firebaseApp = admin.initializeApp({
                            credential: admin.credential.cert({
                                projectId: process.env.FIREBASE_PROJECT_ID,
                                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                            }),
                        });
                    }
                } catch (error) {
                    console.error('Firebase initialization failed:', error);
                }
            }
        }
    }

    /**
     * Send a notification to a specific user
     * @param {string} userId - The ID of the user to notify
     * @param {string} event - The event type
     * @param {object} data - The notification data
     * @param {object} options - Additional options for Firebase notifications
     */
    async sendNotification(userId, event, data, options = {}) {
        try {
            // Store notification in database
            await this.storeNotification(userId, event, data);

            // Attempt to send realtime notification
            switch (this.provider) {
            case 'pusher':
                await this.sendPusherNotification(userId, event, data);
                break;
            case 'firebase':
                try {
                    await this.sendFirebaseNotification(userId, event, data, options);
                } catch (error) {
                    // If Firebase fails, fall back to Pusher if available
                    if (this.pusher && error.message.includes('No FCM token')) {
                        console.log(`No FCM token for user ${userId}, falling back to Pusher`);
                        await this.sendPusherNotification(userId, event, data);
                    } else {
                        throw error;
                    }
                }
                break;
            case 'both':
                // Try both, but don't fail if one fails
                const results = await Promise.allSettled([
                    this.sendPusherNotification(userId, event, data),
                    this.sendFirebaseNotification(userId, event, data, options).catch((error) => {
                        if (!error.message.includes('No FCM token')) {
                            throw error;
                        }
                    }),
                ]);

                // Log failures but don't throw
                results.forEach((result, index) => {
                    if (result.status === 'rejected') {
                        console.error(`Notification method ${index === 0 ? 'Pusher' : 'Firebase'} failed:`,
                            result.reason);
                    }
                });
                break;
            default:
                throw new Error(`Unsupported notification provider: ${this.provider}`);
            }
        } catch (error) {
            console.error('Notification sending failed:', error);
            // Don't rethrow - we don't want a notification failure to break application flow
        }
    }

    /**
     * Store notification in database
     * @param {string} userId - The ID of the user to notify
     * @param {string} event - The event type
     * @param {object} data - The notification data
     */
    async storeNotification(userId, event, data) {
        try {
            // Map event to notification type
            let type = 'mention';
            if (event === NOTIFICATION_TYPES.TASK_ASSIGNED) {
                type = 'task_assigned';
            } else if (event === NOTIFICATION_TYPES.TASK_UPDATED) {
                type = 'task_updated';
            } else if (event === NOTIFICATION_TYPES.COMMENT_CREATED) {
                type = 'comment_reply';
            } else if (event === NOTIFICATION_TYPES.COMMENT_LIKED) {
                type = 'comment_like';
            } else if (event === NOTIFICATION_TYPES.USER_MENTIONED) {
                type = 'mention';
            }

            await Notification.create({
                userId,
                type,
                message: data.message || data.title,
                taskId: data.taskId,
                commentId: data.commentId,
                actorId: data.assignerId || data.updaterId || data.commenterId || data.mentionerId,
                read: false,
            });
        } catch (error) {
            console.error('Failed to store notification in database:', error);
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
     * Send notification to multiple users
     * @param {string[]} userIds - Array of user IDs to notify
     * @param {string} event - The event type
     * @param {object} data - The notification data
     * @param {object} options - Additional options for Firebase notifications
     */
    async sendBulkNotification(userIds, event, data, options = {}) {
        try {
            const notifications = userIds.map((userId) =>
                this.sendNotification(userId, event, data, options),
            );
            await Promise.all(notifications);
        } catch (error) {
            console.error('Bulk notification sending failed:', error);
        }
    }

    /**
     * Send notification to all users in a workspace
     * @param {string} workspaceId - The workspace ID
     * @param {string} event - The event type
     * @param {object} data - The notification data
     * @param {object} options - Additional options for Firebase notifications
     */
    async sendWorkspaceNotification(workspaceId, event, data, options = {}) {
        try {
            const workspaceUsers = await User.findAll({
                include: [{
                    model: Workspace,
                    as: 'workspaces',
                    where: {id: workspaceId},
                    attributes: [],
                }],
                attributes: ['id'],
            });

            const userIds = workspaceUsers.map((user) => user.id);
            await this.sendBulkNotification(userIds, event, data, options);
        } catch (error) {
            console.error('Workspace notification sending failed:', error);
        }
    }

    /**
     * Send a task assignment notification
     * @param {string} taskId - The task ID
     * @param {string} taskTitle - The task title
     * @param {string} assignerId - The ID of the user assigning the task
     * @param {string} assignerName - The name of the user assigning the task
     * @param {string[]} assigneeIds - Array of user IDs being assigned
     */
    async sendTaskAssignmentNotification(taskId, taskTitle, assignerId, assignerName, assigneeIds) {
        const data = {
            taskId,
            taskTitle,
            assignerId,
            assignerName,
        };

        const validation = validateNotificationData(NOTIFICATION_TYPES.TASK_ASSIGNED, data);
        if (!validation.isValid) {
            console.error('Invalid notification data:', validation.errors);
            return;
        }

        await this.sendBulkNotification(
            assigneeIds,
            NOTIFICATION_TYPES.TASK_ASSIGNED,
            validation.data,
        );
    }

    /**
     * Send a task update notification
     * @param {string} taskId - The task ID
     * @param {string} taskTitle - The task title
     * @param {string} updaterId - The ID of the user updating the task
     * @param {string} updaterName - The name of the user updating the task
     * @param {string[]} notifyUserIds - Array of user IDs to notify
     */
    async sendTaskUpdateNotification(taskId, taskTitle, updaterId, updaterName, notifyUserIds) {
        const data = {
            taskId,
            taskTitle,
            updaterId,
            updaterName,
        };

        const validation = validateNotificationData(NOTIFICATION_TYPES.TASK_UPDATED, data);
        if (!validation.isValid) {
            console.error('Invalid notification data:', validation.errors);
            return;
        }

        await this.sendBulkNotification(
            notifyUserIds,
            NOTIFICATION_TYPES.TASK_UPDATED,
            validation.data,
        );
    }

    /**
     * Send a comment notification
     * @param {string} taskId - The task ID
     * @param {string} taskTitle - The task title
     * @param {string} commentId - The comment ID
     * @param {string} commenterId - The ID of the user commenting
     * @param {string} commenterName - The name of the user commenting
     * @param {string[]} notifyUserIds - Array of user IDs to notify
     */
    async sendCommentNotification(taskId, taskTitle, commentId, commenterId, commenterName, notifyUserIds) {
        const data = {
            taskId,
            taskTitle,
            commentId,
            commenterId,
            commenterName,
        };

        const validation = validateNotificationData(NOTIFICATION_TYPES.COMMENT_CREATED, data);
        if (!validation.isValid) {
            console.error('Invalid notification data:', validation.errors);
            return;
        }

        await this.sendBulkNotification(
            notifyUserIds,
            NOTIFICATION_TYPES.COMMENT_CREATED,
            validation.data,
        );
    }

    /**
     * Send a workspace invite notification
     * @param {string} workspaceId - The workspace ID
     * @param {string} workspaceName - The workspace name
     * @param {string} inviterId - The ID of the user sending the invite
     * @param {string} inviterName - The name of the user sending the invite
     * @param {string} inviteeId - The ID of the user being invited
     */
    async sendWorkspaceInviteNotification(workspaceId, workspaceName, inviterId, inviterName, inviteeId) {
        const data = {
            workspaceId,
            workspaceName,
            inviterId,
            inviterName,
        };

        const validation = validateNotificationData(NOTIFICATION_TYPES.WORKSPACE_INVITE, data);
        if (!validation.isValid) {
            console.error('Invalid notification data:', validation.errors);
            return;
        }

        await this.sendNotification(
            inviteeId,
            NOTIFICATION_TYPES.WORKSPACE_INVITE,
            validation.data,
        );
    }

    /**
     * Send a mention notification
     * @param {string} mentionedUserId - The ID of the user being mentioned
     * @param {string} mentionerId - The ID of the user mentioning
     * @param {string} mentionerName - The name of the user mentioning
     * @param {string} contextId - The ID of the context (task/comment)
     * @param {string} contextType - The type of context ('task' or 'comment')
     */
    async sendMentionNotification(mentionedUserId, mentionerId, mentionerName, contextId, contextType) {
        const data = {
            mentionerId,
            mentionerName,
            contextId,
            contextType,
        };

        const validation = validateNotificationData(NOTIFICATION_TYPES.USER_MENTIONED, data);
        if (!validation.isValid) {
            console.error('Invalid notification data:', validation.errors);
            return;
        }

        await this.sendNotification(
            mentionedUserId,
            NOTIFICATION_TYPES.USER_MENTIONED,
            validation.data,
        );
    }
}

// Export a singleton instance
export const notificationService = new NotificationService();

// For backward compatibility with existing code
export const notificationHandler = notificationService;
