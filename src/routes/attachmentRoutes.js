/**
 * Routes for file attachments
 */
import express from 'express';
import auth from '../middleware/authMiddleware.js';
import {uploadSingle, handleMulterError} from '../middleware/uploadMiddleware.js';
import {
    uploadTaskAttachment,
    uploadCommentAttachment,
    getTaskAttachments,
    getCommentAttachments,
    deleteAttachment,
} from '../controllers/attachmentController.js';

// eslint-disable-next-line new-cap
const router = express.Router();

// Apply authentication middleware to all routes
router.use(auth);

// Task attachment routes
router.post('/tasks/:taskId/attachments', uploadSingle('file'), uploadTaskAttachment);
router.get('/tasks/:taskId/attachments', getTaskAttachments);

// Comment attachment routes
router.post('/comments/:commentId/attachments', uploadSingle('file'), uploadCommentAttachment);
router.get('/comments/:commentId/attachments', getCommentAttachments);

// Delete attachment
router.delete('/attachments/:attachmentId', deleteAttachment);

// Handle multer errors
router.use(handleMulterError);

export default router;
