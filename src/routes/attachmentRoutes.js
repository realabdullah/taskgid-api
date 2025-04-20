/**
 * Routes for file attachments
 */
import express from 'express';
import multer from 'multer';
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

// Configure Multer for file uploads
// Store in memory temporarily before passing to storage provider
// Add file size limits and potentially file type filters here
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {fileSize: 10 * 1024 * 1024}, // 10MB limit example
    // fileFilter: (req, file, cb) => { ... check mimetype ... }
});

// Middleware for all attachment routes
router.use(authMiddleware);

// Get Attachments
router.get('/tasks/:taskId/attachments', getTaskAttachments); // Needs workspace ID context implicitly via task
// Needs workspace ID context implicitly via comment
router.get('/comments/:commentId/attachments', getCommentAttachments);

// Upload Attachments
// The route needs workspace ID for permission checks in controller
// We pass it as part of the URL structure common to tasks/comments
router.post('/workspaces/:id/tasks/:taskId/attachments', upload.single('file'), uploadTaskAttachment);
router.post('/workspaces/:id/comments/:commentId/attachments', upload.single('file'), uploadCommentAttachment);

// Delete Attachment (using attachment's own ID)
router.delete('/attachments/:attachmentId', deleteAttachment);

export default router;
