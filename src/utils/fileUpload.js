/**
 * Utility functions for handling file uploads
 */
import {createStorageProvider} from './storageProviders.js';
import 'dotenv/config';

// Get storage provider from environment variables
// Default to 'cloudinary' if not specified (no longer supporting 'local')
const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || 'cloudinary';

// Validate storage provider is supported
if (!['cloudinary', 's3', 'r2'].includes(STORAGE_PROVIDER)) {
    console.error(`Invalid storage provider: ${STORAGE_PROVIDER}. Using cloudinary as fallback.`);
}

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
let storageProvider;

try {
    storageProvider = createStorageProvider(
        STORAGE_PROVIDER,
        storageConfig[STORAGE_PROVIDER],
    );
} catch (error) {
    console.error(`Failed to initialize storage provider (${STORAGE_PROVIDER}): ${error.message}`);
    console.error('Please configure your cloud storage provider in environment variables.');
    storageProvider = {
        upload: async () => {
            throw new Error('Storage provider not properly configured. File upload unavailable.');
        },
        delete: async () => {
            throw new Error('Storage provider not properly configured. File deletion unavailable.');
        },
        getFileUrl: () => {
            throw new Error('Storage provider not properly configured. File URL retrieval unavailable.');
        },
        getInfo: async () => {
            throw new Error('Storage provider not properly configured. File info retrieval unavailable.');
        },
    };
}

/**
 * Process and save an uploaded file
 * @param {Object} file - File object from multer
 * @param {Object} options - Processing options
 * @param {boolean} options.processImage - Whether to process the image (default: true for images)
 * @param {number} options.width - Maximum width for images (default: 800)
 * @param {number} options.height - Maximum height for images (default: 800)
 * @param {number} options.quality - JPEG quality (default: 70)
 * @return {Promise<Object>} File information
 */
export const processAndSaveFile = async (file, options = {}) => {
    // Set default options for image processing
    const processOptions = {
        processImage: options.processImage ?? (file.mimetype?.startsWith('image/') ? true : false),
        width: options.width || 800,
        height: options.height || 800,
        quality: options.quality || 70,
        ...options,
    };

    return storageProvider.upload(file, processOptions);
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
