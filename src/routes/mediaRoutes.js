import express from 'express';
import { uploadSingle, uploadMultiple, handleMulterError } from '../middleware/uploadMiddleware.js';
import { uploadFile, uploadFiles } from '../controllers/mediaController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

// All media routes require authentication
router.use(authMiddleware);

/**
 * @swagger
 * /media/upload:
 *   post:
 *     summary: Upload a single file
 *     tags: [Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: File uploaded successfully
 */
router.post('/upload', uploadSingle('file'), uploadFile);

/**
 * @swagger
 * /media/bulk-upload:
 *   post:
 *     summary: Upload multiple files
 *     tags: [Media]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Files uploaded successfully
 */
router.post('/bulk-upload', uploadMultiple('files', 10), uploadFiles);

// Error handler for these routes
router.use(handleMulterError);

export default router;
