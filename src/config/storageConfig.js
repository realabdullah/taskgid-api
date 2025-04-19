/**
 * Storage configuration for different providers
 * Configure your preferred storage provider and its settings here
 */

const storageConfig = {
    // The storage provider to use: 'local', 'cloudinary', 's3', or 'r2'
    provider: process.env.STORAGE_PROVIDER || 'local',

    // Local storage configuration
    local: {
        uploadDir: process.env.UPLOAD_DIR || 'uploads',
        publicUrl: process.env.PUBLIC_URL || 'http://localhost:3000/uploads',
    },

    // Cloudinary configuration
    cloudinary: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
        apiSecret: process.env.CLOUDINARY_API_SECRET,
        folder: process.env.CLOUDINARY_FOLDER || 'taskgid',
    },

    // AWS S3 configuration
    s3: {
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        bucket: process.env.AWS_BUCKET_NAME,
        publicUrl: process.env.AWS_PUBLIC_URL,
    },

    // Cloudflare R2 configuration
    r2: {
        accountId: process.env.R2_ACCOUNT_ID,
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        bucket: process.env.R2_BUCKET_NAME,
        publicUrl: process.env.R2_PUBLIC_URL,
    },
};

module.exports = storageConfig;
