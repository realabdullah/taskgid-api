/**
 * Controller for handling file attachments
 */
import Attachment from '../models/Attachment.js';
import Task from '../models/Task.js';
import Comment from '../models/Comment.js';
import {deleteFile} from '../utils/fileUpload.js';
import {getUserRoleInWorkspace} from '../utils/workspaceUtils.js';
import {errorResponse} from '../utils/responseUtils.js';

/**
 * Handles file upload and attachment creation for a Task.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
export const uploadTaskAttachment = async (req, res) => {
    const {id: workspaceId, taskId} = req.params;
    const userId = req.user.id;

    if (!req.uploadedFile) {
        return errorResponse(res, 400, 'No file uploaded.');
    }

    try {
        // 1. Authorization: Check if user is member of the task's workspace
        const task = await Task.findByPk(taskId, {attributes: ['workspaceId']});
        if (!task) {
            return errorResponse(res, 404, 'Task not found');
        }
        if (task.workspaceId !== workspaceId) { // Basic sanity check
            return errorResponse(res, 400, 'Task does not belong to the specified workspace');
        }
        const role = await getUserRoleInWorkspace(userId, workspaceId);
        if (!role) {
            return errorResponse(res, 403, 'Access denied to this workspace');
        }

        // 2. File already uploaded via uploadMiddleware
        const uploadedFile = req.uploadedFile;
        if (!uploadedFile || !uploadedFile.url) {
            throw new Error('File upload failed via storage provider.');
        }

        // 3. Create Attachment record in DB
        const attachment = await Attachment.create({
            filename: uploadedFile.path, // Or key, depending on provider
            originalname: uploadedFile.filename,
            mimetype: uploadedFile.mimetype,
            size: uploadedFile.size,
            path: uploadedFile.id, // Store the path/key for deletion
            url: uploadedFile.url,
            storageType: 'R2',
            userId: userId,
            taskId: taskId, // Link to task
            commentId: null, // Explicitly null for task attachments
        });

        res.status(201).json({success: true, attachment});
    } catch (error) {
        console.error('Error uploading task attachment:', error);
        // Attempt to clean up uploaded file if DB insert fails
        if (req.uploadedFile && error.name !== 'StorageUploadError') { // Avoid deleting if storage itself failed
            try {
                const pathToDelete = (error.attachmentData && error.attachmentData.path) || req.uploadedFile.id;
                if (pathToDelete) await deleteFile(pathToDelete);
            } catch (cleanupError) {
                console.error('Failed to cleanup partially uploaded file:', cleanupError);
            }
        }
        return errorResponse(res, 500, 'Failed to upload attachment.');
    }
};

/**
 * Handles file upload and attachment creation for a Comment.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
export const uploadCommentAttachment = async (req, res) => {
    const {id: workspaceId, commentId} = req.params;
    const userId = req.user.id;

    if (!req.uploadedFile) {
        return errorResponse(res, 400, 'No file uploaded.');
    }

    try {
        // 1. Authorization: Check if user is member of the comment's workspace
        const comment = await Comment.findByPk(commentId, {
            include: [{model: Task, as: 'task', attributes: ['workspaceId']}],
        });
        if (!comment) {
            return errorResponse(res, 404, 'Comment not found');
        }
        if (!comment.task || comment.task.workspaceId !== workspaceId) { // Basic sanity check
            return errorResponse(res, 400, 'Comment does not belong to the specified workspace');
        }
        const role = await getUserRoleInWorkspace(userId, workspaceId);
        if (!role) {
            return errorResponse(res, 403, 'Access denied to this workspace');
        }

        // 2. File already uploaded via uploadMiddleware
        const uploadedFile = req.uploadedFile;
        if (!uploadedFile || !uploadedFile.url) {
            throw new Error('File upload failed via storage provider.');
        }

        // 3. Create Attachment record
        const attachment = await Attachment.create({
            filename: uploadedFile.path,
            originalname: uploadedFile.filename,
            mimetype: uploadedFile.mimetype,
            size: uploadedFile.size,
            path: uploadedFile.id,
            url: uploadedFile.url,
            storageType: 'R2',
            userId: userId,
            taskId: null, // Explicitly null for comment attachments
            commentId: commentId, // Link to comment
        });

        res.status(201).json({success: true, attachment});
    } catch (error) {
        console.error('Error uploading comment attachment:', error);
        // Attempt cleanup
        if (req.uploadedFile && error.name !== 'StorageUploadError') {
            try {
                const pathToDelete = (error.attachmentData && error.attachmentData.path) || req.uploadedFile.id;
                if (pathToDelete) await deleteFile(pathToDelete);
            } catch (cleanupError) {
                console.error('Failed to cleanup partially uploaded file:', cleanupError);
            }
        }
        return errorResponse(res, 500, 'Failed to upload attachment.');
    }
};

/**
 * Deletes an attachment.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
export const deleteAttachment = async (req, res) => {
    const {attachmentId} = req.params;
    const userId = req.user.id;

    try {
        const attachment = await Attachment.findByPk(attachmentId);
        if (!attachment) {
            return errorResponse(res, 404, 'Attachment not found');
        }

        // Authorization: Check if user is the uploader or workspace admin/creator
        let workspaceId = null;
        if (attachment.taskId) {
            const task = await Task.findByPk(attachment.taskId, {attributes: ['workspaceId']});
            workspaceId = task?.workspaceId;
        } else if (attachment.commentId) {
            const comment = await Comment.findByPk(attachment.commentId, {
                include: [{model: Task, as: 'task', attributes: ['workspaceId']}],
            });
            workspaceId = comment?.task?.workspaceId;
        }

        if (!workspaceId) {
            // Should not happen if attachment is valid, but safety check
            console.error(`Could not determine workspace for attachment ${attachmentId}`);
            return errorResponse(res, 500, 'Could not verify attachment ownership.');
        }

        const role = await getUserRoleInWorkspace(userId, workspaceId);
        const isOwner = attachment.userId === userId;
        const canDelete = isOwner || (role && ['creator', 'admin'].includes(role));

        if (!canDelete) {
            return errorResponse(res, 403, 'You do not have permission to delete this attachment');
        }

        // Delete file from storage provider
        await deleteFile(attachment.path); // Use stored path/key

        // Delete Attachment record from DB
        await attachment.destroy();

        res.json({success: true, message: 'Attachment deleted successfully'});
    } catch (error) {
        console.error(`Error deleting attachment ${attachmentId}:`, error);
        // Check if it was a storage provider error vs DB error
        if (error.name === 'StorageDeleteError') {
            return errorResponse(res, 500, 'Failed to delete file from storage. Please try again.');
        } else {
            return errorResponse(res, 500, 'Failed to delete attachment record.');
        }
    }
};

/**
 * Lists attachments for a specific task.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
export const getTaskAttachments = async (req, res) => {
    const {id: workspaceId, taskId} = req.params;
    const userId = req.user.id;

    try {
        // Authorization: Check if user is member of the task's workspace
        const task = await Task.findByPk(taskId, {attributes: ['workspaceId']});
        if (!task) {
            return errorResponse(res, 404, 'Task not found');
        }
        if (task.workspaceId !== workspaceId) {
            return errorResponse(res, 400, 'Task does not belong to the specified workspace');
        }
        const role = await getUserRoleInWorkspace(userId, workspaceId);
        if (!role) {
            return errorResponse(res, 403, 'Access denied to this workspace');
        }

        const attachments = await Attachment.findAll({
            where: {taskId: taskId},
            include: [{
                model: User,
                as: 'user',
                attributes: ['id', 'username', 'firstName'],
            }], // Include uploader basic info
            order: [['createdAt', 'ASC']],
        });

        res.json({success: true, attachments});
    } catch (error) {
        console.error(`Error fetching attachments for task ${taskId}:`, error);
        return errorResponse(res, 500, 'Failed to fetch task attachments.');
    }
};

/**
 * Lists attachments for a specific comment.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 */
export const getCommentAttachments = async (req, res) => {
    const {id: workspaceId, commentId} = req.params;
    const userId = req.user.id;

    try {
        // Authorization: Check if user is member of the comment's workspace
        const comment = await Comment.findByPk(commentId, {
            include: [{model: Task, as: 'task', attributes: ['workspaceId']}],
        });
        if (!comment) {
            return errorResponse(res, 404, 'Comment not found');
        }
        if (!comment.task || comment.task.workspaceId !== workspaceId) {
            return errorResponse(res, 400, 'Comment does not belong to the specified workspace');
        }
        const role = await getUserRoleInWorkspace(userId, workspaceId);
        if (!role) {
            return errorResponse(res, 403, 'Access denied to this workspace');
        }

        const attachments = await Attachment.findAll({
            where: {commentId: commentId},
            include: [{model: User, as: 'user', attributes: ['id', 'username', 'firstName']}],
            order: [['createdAt', 'ASC']],
        });

        res.json({success: true, attachments});
    } catch (error) {
        console.error(`Error fetching attachments for comment ${commentId}:`, error);
        return errorResponse(res, 500, 'Failed to fetch comment attachments.');
    }
};
