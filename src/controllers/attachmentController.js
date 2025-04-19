/**
 * Controller for handling file attachments
 */
import Attachment from '../models/Attachment.js';
import Task from '../models/Task.js';
import Comment from '../models/Comment.js';
import 'dotenv/config';
import {deleteFile} from '../utils/fileUpload.js';

/**
 * Upload a file attachment to a task
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const uploadTaskAttachment = async (req, res) => {
    try {
        const {taskId} = req.params;
        const {uploadedFile} = req;

        if (!uploadedFile) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded',
            });
        }

        // Check if task exists
        const task = await Task.findByPk(taskId);
        if (!task) {
            return res.status(404).json({
                success: false,
                error: 'Task not found',
            });
        }

        // Create attachment record
        const attachment = await Attachment.create({
            ...uploadedFile,
            taskId,
            userId: req.user.id,
        });

        res.status(201).json({
            success: true,
            attachment,
        });
    } catch (error) {
        console.error('Error uploading task attachment:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to upload attachment',
        });
    }
};

/**
 * Upload a file attachment to a comment
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const uploadCommentAttachment = async (req, res) => {
    try {
        const {commentId} = req.params;
        const {uploadedFile} = req;

        if (!uploadedFile) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded',
            });
        }

        // Check if comment exists
        const comment = await Comment.findByPk(commentId);
        if (!comment) {
            return res.status(404).json({
                success: false,
                error: 'Comment not found',
            });
        }

        // Create attachment record
        const attachment = await Attachment.create({
            ...uploadedFile,
            commentId,
            userId: req.user.id,
        });

        res.status(201).json({
            success: true,
            attachment,
        });
    } catch (error) {
        console.error('Error uploading comment attachment:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to upload attachment',
        });
    }
};

/**
 * Get all attachments for a task
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const getTaskAttachments = async (req, res) => {
    try {
        const {taskId} = req.params;

        // Check if task exists
        const task = await Task.findByPk(taskId);
        if (!task) {
            return res.status(404).json({
                success: false,
                error: 'Task not found',
            });
        }

        // Get attachments
        const attachments = await Attachment.findAll({
            where: {taskId},
            order: [['createdAt', 'DESC']],
        });

        res.json({
            success: true,
            attachments,
        });
    } catch (error) {
        console.error('Error getting task attachments:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get attachments',
        });
    }
};

/**
 * Get all attachments for a comment
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const getCommentAttachments = async (req, res) => {
    try {
        const {commentId} = req.params;

        // Check if comment exists
        const comment = await Comment.findByPk(commentId);
        if (!comment) {
            return res.status(404).json({
                success: false,
                error: 'Comment not found',
            });
        }

        // Get attachments
        const attachments = await Attachment.findAll({
            where: {commentId},
            order: [['createdAt', 'DESC']],
        });

        res.json({
            success: true,
            attachments,
        });
    } catch (error) {
        console.error('Error getting comment attachments:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get attachments',
        });
    }
};

/**
 * Delete an attachment
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export const deleteAttachment = async (req, res) => {
    try {
        const {attachmentId} = req.params;

        // Find attachment
        const attachment = await Attachment.findByPk(attachmentId);
        if (!attachment) {
            return res.status(404).json({
                success: false,
                error: 'Attachment not found',
            });
        }

        // Check if user is authorized to delete
        if (attachment.userId !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to delete this attachment',
            });
        }

        // Delete file from storage
        await deleteFile(attachment.filename);

        // Delete attachment record
        await attachment.destroy();

        res.json({
            success: true,
            message: 'Attachment deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting attachment:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete attachment',
        });
    }
};
