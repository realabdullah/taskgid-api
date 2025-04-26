/**
 * Utility functions for handling file uploads
 */
import {createStorageProvider} from './storageProviders.js';
import 'dotenv/config';

// Get storage provider from environment variables
const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || 'local';

// Storage provider configuration
const storageConfig = {
    // Cloudinary config
    cloudinary: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
        apiSecret: process.env.CLOUDINARY_API_SECRET,
        folder: process.env.CLOUDINARY_FOLDER || 'taskgid',
    },
    // AWS S3 config
    s3: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION,
        bucket: process.env.AWS_BUCKET,
        folder: process.env.AWS_FOLDER || 'taskgid',
    },
    // Cloudflare R2 config
    r2: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        accountId: process.env.R2_ACCOUNT_ID,
        bucket: process.env.R2_BUCKET,
        folder: process.env.R2_FOLDER || 'taskgid',
        publicUrl: process.env.R2_PUBLIC_URL,
    },
};

// Create storage provider instance
const storageProvider = createStorageProvider(
    STORAGE_PROVIDER,
    storageConfig[STORAGE_PROVIDER],
);

/**
 * Process and save an uploaded file
 * @param {Object} file - File object from multer
 * @param {Object} options - Processing options
 * @param {boolean} options.compress - Whether to compress the file (default: true)
 * @param {number} options.maxWidth - Maximum width for images (default: 800)
 * @param {number} options.maxHeight - Maximum height for images (default: 800)
 * @param {number} options.quality - JPEG quality (default: 80)
 * @return {Promise<Object>} File information
 */
export const processAndSaveFile = async (file, options = {}) => {
    return storageProvider.upload(file, options);
};

/**
 * Delete a file from storage
 * @param {string} fileId - File identifier (filename, cloudinaryId, s3Key, or r2Key)
 * @return {Promise<boolean>} Success status
 */
export const deleteFile = async (fileId) => {
    return storageProvider.delete(fileId);
};

/**
 * Get file information without saving it
 * @param {Object} file - File object from multer
 * @return {Object} File information
 */
export const getFileInfo = (file) => {
    return {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
    };
};

export default {
    processAndSaveFile,
    deleteFile,
    getFileInfo,
};
