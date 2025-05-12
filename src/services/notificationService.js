import Pusher from 'pusher';
import admin from 'firebase-admin';
import 'dotenv/config';
import Knock from '@knocklabs/node';
import User from '../models/User.js';
import {Workspace} from '../models/Workspace.js';
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
        // Initialize Pusher if configured
        if (this.provider === 'pusher') {
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
        if (this.provider === 'firebase') {
            if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL ||
                !process.env.FIREBASE_PRIVATE_KEY) {
                console.warn('Firebase configuration is incomplete');
            } else {
                try {
                    if (!admin.apps.length) {
                        this.firebaseApp = admin.initializeApp({
                            credential: admin.credential.cert({
                                projectId: process.env.FIREBASE_PROJECT_ID,
                                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
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

        // Initialize Knock if configured
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
     * Store notification in database
     * @param {string} userId - The ID of the user to notify
     * @param {string} event - The event type
     * @param {object} data - The notification data
     * @return {Promise<object>} The stored notification
     */
    async storeNotification(userId, event, data) {
        try {
            // Validate notification data
            validateNotificationData(event, data);

            const notification = await Notification.create({
                userId,
                type: event,
                data,
                read: false,
            });

            return notification;
        } catch (error) {
            console.error('Error storing notification:', error);
            throw error;
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
            // Store notification in database
            await this.storeNotification(userId, event, data);

            // Attempt to send realtime notification with the configured provider
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
            // Don't rethrow - we don't want a notification failure to break application flow
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

        // First ensure user exists in Knock
        await this.knockClient.users.identify(userId, {
            email: user.email,
            name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
            // Include optional properties that can be used in the notification templates
            properties: {
                username: user.username,
                profilePicture: user.profilePicture,
            },
        });

        // Map TaskGid event to Knock workflow
        const workflowKey = this.mapEventToKnockWorkflow(event);
        if (!workflowKey) {
            console.warn(`No Knock workflow mapped for event ${event}`);
            return;
        }

        // Trigger the workflow
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
     * @param {object} options - Additional options for notifications
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
     * Store Knock token for a user
     * @param {string} userId - The ID of the user
     * @param {string} knockToken - The Knock token for the user
     */
    async storeKnockToken(userId, knockToken) {
        try {
            await User.update(
                {knockToken},
                {where: {id: userId}},
            );
            return true;
        } catch (error) {
            console.error('Store Knock token failed:', error);
            return false;
        }
    }

    // Helper methods for backward compatibility

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

// Export singleton instance
export default new NotificationService();
