/**
 * Routes for file attachments
 */
import express from 'express';
import {uploadSingle} from '../middleware/uploadMiddleware.js';
import {
    uploadTaskAttachment,
    uploadCommentAttachment,
    deleteAttachment,
    getTaskAttachments,
    getCommentAttachments,
} from '../controllers/attachmentController.js';
import authMiddleware from '../middleware/authMiddleware.js';
// Assuming storageProvider has limitations defined, or use a general config
// import uploadConfig from '../config/uploadConfig';

// eslint-disable-next-line new-cap
const router = express.Router();


// Middleware for all attachment routes
router.use(authMiddleware);

// Get Attachments
router.get('/tasks/:taskId/attachments', getTaskAttachments); // Needs workspace ID context implicitly via task
// Needs workspace ID context implicitly via comment
router.get('/comments/:commentId/attachments', getCommentAttachments);

router.post('/workspaces/:id/tasks/:taskId/attachments', uploadSingle('file'), uploadTaskAttachment);
router.post('/workspaces/:id/comments/:commentId/attachments', uploadSingle('file'), uploadCommentAttachment);

// Delete Attachment (using attachment's own ID)
router.delete('/attachments/:attachmentId', deleteAttachment);

export default router;
