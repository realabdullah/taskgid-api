/**
 * Middleware for handling file uploads
 */
import multer from 'multer';
import {processAndSaveFile, deleteFile} from '../utils/fileUpload.js';

// Configure multer for memory storage
const storage = multer.memoryStorage();

// File filter to restrict file types
const fileFilter = (req, file, cb) => {
    // Allow images, PDFs, and common document formats
    const allowedMimeTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'text/csv',
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only images, PDFs, and common document formats are allowed.'), false);
    }
};

// Configure multer
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 10MB max file size
    },
});

/**
 * Middleware for handling single file uploads
 * @param {string} fieldName - Name of the file field in the form
 * @return {Function} Middleware function
 */
export const uploadSingle = (fieldName) => {
    return [
        upload.single(fieldName),
        async (req, res, next) => {
            if (!req.file) {
                return next();
            }

            try {
                const fileInfo = await processAndSaveFile(req.file);
                req.uploadedFile = fileInfo;
                next();
            } catch (error) {
                next(error);
            }
        },
    ];
};

/**
 * Middleware for handling multiple file uploads
 * @param {string} fieldName - Name of the file field in the form
 * @param {number} maxCount - Maximum number of files to upload
 * @return {Function} Middleware function
 */
export const uploadMultiple = (fieldName, maxCount = 5) => {
    return [
        upload.array(fieldName, maxCount),
        async (req, res, next) => {
            if (!req.files || req.files.length === 0) {
                return next();
            }

            try {
                const uploadedFiles = await Promise.all(
                    req.files.map((file) => processAndSaveFile(file)),
                );
                req.uploadedFiles = uploadedFiles;
                next();
            } catch (error) {
                // Clean up any files that were uploaded before the error
                if (req.uploadedFiles) {
                    req.uploadedFiles.forEach((file) => {
                        deleteFile(file.filename).catch((err) => {
                            console.error('Error deleting file after upload error:', err);
                        });
                    });
                }
                next(error);
            }
        },
    ];
};

/**
 * Error handler for multer errors
 * @param {Error} error - Error object
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 * @return {void}
 */
export const handleMulterError = (error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'File size too large. Maximum size is 10MB.',
            });
        }

        return res.status(400).json({
            success: false,
            error: `File upload error: ${error.message}`,
        });
    }

    if (error.message.includes('Invalid file type')) {
        return res.status(400).json({
            success: false,
            error: error.message,
        });
    }

    next(error);
};
