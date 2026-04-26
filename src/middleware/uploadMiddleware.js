/**
 * Middleware for handling file uploads
 */
import multer from 'multer';
import multerS3 from 'multer-s3';
import {S3Client} from '@aws-sdk/client-s3';
import {v4 as uuidv4} from 'uuid';
import path from 'path';
import 'dotenv/config';

// Configure S3 Client for R2
const s3Client = new S3Client({
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: 'auto',
    forcePathStyle: true,
});

const folder = process.env.R2_FOLDER || 'taskgid';

// Configure multer-s3 storage
const storage = multerS3({
    s3: s3Client,
    bucket: process.env.R2_BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function(req, file, cb) {
        const timestamp = Date.now();
        const randomString = uuidv4().substring(0, 8);
        const extension = path.extname(file.originalname);
        cb(null, `${folder}/${timestamp}-${randomString}${extension}`);
    },
});

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
        (req, res, next) => {
            if (!req.file) {
                return next();
            }
            req.uploadedFile = {
                id: req.file.key,
                url: `${process.env.R2_PUBLIC_URL}/${req.file.key}`,
                filename: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
            };
            next();
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
        (req, res, next) => {
            if (!req.files || req.files.length === 0) {
                return next();
            }
            req.uploadedFiles = req.files.map((file) => ({
                id: file.key,
                url: `${process.env.R2_PUBLIC_URL}/${file.key}`,
                filename: file.originalname,
                mimetype: file.mimetype,
                size: file.size,
            }));
            next();
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
