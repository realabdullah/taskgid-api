/**
 * Utility functions for handling file uploads
 */
import CloudflareR2StorageProvider from './storageProviders.js';
import 'dotenv/config';

// Cloudflare R2 config
const r2Config = {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    accountId: process.env.R2_ACCOUNT_ID,
    bucket: process.env.R2_BUCKET,
    folder: process.env.R2_FOLDER || 'taskgid',
    publicUrl: process.env.R2_PUBLIC_URL,
};

let storageProvider;

try {
    storageProvider = new CloudflareR2StorageProvider(r2Config);
} catch (error) {
    console.error(`Failed to initialize storage provider (r2): ${error.message}`);
    console.error('Please configure Cloudflare R2 in environment variables.');
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
 * @param {string} fileId - File identifier (r2Key)
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
