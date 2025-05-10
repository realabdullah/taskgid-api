import Notification from '../models/Notification.js';
import User from '../models/User.js';
import Task from '../models/Task.js';
import Comment from '../models/Comment.js';
import {errorResponse, successResponse} from '../utils/responseUtils.js';

/**
 * Get notifications for a user
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
export const getNotifications = async (req, res) => {
    try {
        const {userId} = req.params;

        // Ensure the user can only access their own notifications
        if (userId !== req.user.id) {
            return errorResponse(res, 403, 'You can only access your own notifications');
        }

        const {page = 1, limit = 10, read} = req.query;
        const offset = (page - 1) * limit;

        const where = {userId};
        if (read !== undefined) {
            where.read = read === 'true';
        }

        const {count, rows: notifications} = await Notification.findAndCountAll({
            where,
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
                },
                {
                    model: User,
                    as: 'actor',
                    attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
                },
                {
                    model: Task,
                    as: 'task',
                    attributes: ['id', 'title', 'status', 'priority'],
                },
                {
                    model: Comment,
                    as: 'comment',
                    attributes: ['id', 'content'],
                },
            ],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit, 10),
            offset,
        });

        const totalPages = Math.ceil(count / limit);

        return successResponse(res, {
            data: notifications,
            pagination: {
                total: count,
                page: parseInt(page, 10),
                limit: parseInt(limit, 10),
                totalPages,
            },
        });
    } catch (error) {
        console.error('Get Notifications Error:', error);
        return errorResponse(res, 500, 'Failed to fetch notifications');
    }
};

/**
 * Add a notification
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
export const addNotification = async (req, res) => {
    try {
        const {userId, type, message, taskId, commentId, actorId} = req.body;

        if (!userId || !type || !message) {
            return errorResponse(res, 400, 'User ID, type, and message are required');
        }

        // Validate notification type
        const validTypes = ['mention', 'task_assigned', 'task_updated', 'comment_reply', 'comment_like'];
        if (!validTypes.includes(type)) {
            return errorResponse(res, 400, `Invalid notification type. Must be one of: ${validTypes.join(', ')}`);
        }

        const notification = await Notification.create({
            userId,
            type,
            message,
            taskId,
            commentId,
            actorId,
            read: false,
        });

        return successResponse(res, {data: notification}, 201);
    } catch (error) {
        console.error('Add Notification Error:', error);
        return errorResponse(res, 500, 'Failed to add notification');
    }
};

/**
 * Mark a notification as read
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
export const markNotificationAsRead = async (req, res) => {
    try {
        const {id} = req.params;

        const notification = await Notification.findByPk(id);

        if (!notification) {
            return errorResponse(res, 404, 'Notification not found');
        }

        // Ensure the user can only mark their own notifications as read
        if (notification.userId !== req.user.id) {
            return errorResponse(res, 403, 'You can only mark your own notifications as read');
        }

        await notification.update({read: true});

        return successResponse(res, {message: 'Notification marked as read'});
    } catch (error) {
        console.error('Mark Notification As Read Error:', error);
        return errorResponse(res, 500, 'Failed to mark notification as read');
    }
};

/**
 * Mark all notifications as read for a user
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
export const markAllNotificationsAsRead = async (req, res) => {
    try {
        const {userId} = req.params;

        // Ensure the user can only mark their own notifications as read
        if (userId !== req.user.id) {
            return errorResponse(res, 403, 'You can only mark your own notifications as read');
        }

        await Notification.update(
            {read: true},
            {where: {userId, read: false}},
        );

        return successResponse(res, {message: 'All notifications marked as read'});
    } catch (error) {
        console.error('Mark All Notifications As Read Error:', error);
        return errorResponse(res, 500, 'Failed to mark notifications as read');
    }
};

/**
 * Delete a notification
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
export const deleteNotification = async (req, res) => {
    try {
        const {id} = req.params;

        const notification = await Notification.findByPk(id);

        if (!notification) {
            return errorResponse(res, 404, 'Notification not found');
        }

        // Ensure the user can only delete their own notifications
        if (notification.userId !== req.user.id) {
            return errorResponse(res, 403, 'You can only delete your own notifications');
        }

        await notification.destroy();

        return successResponse(res, {message: 'Notification deleted successfully'});
    } catch (error) {
        console.error('Delete Notification Error:', error);
        return errorResponse(res, 500, 'Failed to delete notification');
    }
};
