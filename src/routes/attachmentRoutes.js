/**
 * Routes for file attachments
 */
import express from 'express';
import {uploadSingle, handleMulterError} from '../middleware/uploadMiddleware.js';
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

// Every handler authorises against the workspace in the path, so it has to be
// there — the list routes previously omitted it and failed the workspace check
// on every request. The segment is a slug, matching the rest of the API.
router.get('/workspaces/:workspaceSlug/tasks/:taskId/attachments', getTaskAttachments);
router.get('/workspaces/:workspaceSlug/comments/:commentId/attachments', getCommentAttachments);

router.post('/workspaces/:workspaceSlug/tasks/:taskId/attachments', uploadSingle('file'), uploadTaskAttachment);
router.post(
    '/workspaces/:workspaceSlug/comments/:commentId/attachments',
    uploadSingle('file'),
    uploadCommentAttachment,
);

// Delete Attachment (using attachment's own ID)
router.delete('/attachments/:attachmentId', deleteAttachment);

// Surfaces file-type and size rejections as JSON instead of an opaque 500.
router.use(handleMulterError);

export default router;
