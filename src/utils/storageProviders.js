/**
 * Storage provider abstractions for different cloud storage services
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import {v4 as uuidv4} from 'uuid';
import crypto from 'crypto';
import {S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand} from '@aws-sdk/client-s3';
import cloudinary from 'cloudinary';

/**
 * Base storage provider class
 */
class BaseStorageProvider {
    /**
   * Upload a file to storage
   * @param {Object} file - File object
   * @param {Object} options - Upload options
   * @return {Promise<Object>} File information
   */
    async upload(file, options = {}) {
        throw new Error('Method not implemented');
    }

    /**
   * Delete a file from storage
   * @param {string} fileId - File identifier
   * @return {Promise<boolean>} Success status
   */
    async delete(fileId) {
        throw new Error('Method not implemented');
    }

    /**
   * Get file URL
   * @param {string} fileId - File identifier
   */
    getFileUrl(fileId) {
        throw new Error('Method not implemented');
    }
}

/**
 * Local filesystem storage provider
 */
class LocalStorageProvider extends BaseStorageProvider {
    /**
   * Initialize local storage provider
   * @param {Object} config - Configuration object
   */
    constructor(config) {
        super();
        this.uploadDir = path.join(process.cwd(), 'uploads');
        this.ensureUploadDir();
        this.publicUrl?.publicUrl || 'http://localhost:3000/uploads';
    }

    /**
   * Ensure upload directory exists
   */
    async ensureUploadDir() {
        if (!fs.existsSync(this.uploadDir)) {
            fs.mkdirSync(this.uploadDir, {recursive: true});
        }
    }

    /**
   * Generate a unique filename
   * @param {string} originalFilename - Original filename
   * @return {string} Unique filename
   */
    generateUniqueFilename(originalFilename) {
        const timestamp = Date.now();
        const randomString = crypto.randomBytes(8).toString('hex');
        const extension = path.extname(originalFilename);
        return `${timestamp}-${randomString}${extension}`;
    }

    /**
   * Upload a file to local storage
   * @param {Object} file - File object
   * @param {Object} options - Upload options
   * @return {Promise<Object>} File information
   */
    async upload(file, options = {}) {
        const filename = this.generateUniqueFilename(file.originalname);
        const filepath = path.join(this.uploadDir, filename);

        // Process image if needed
        if (file.mimetype.startsWith('image/') && options.processImage) {
            await sharp(file.buffer)
                .resize(options.width || 800, options.height || 800, {
                    fit: 'inside',
                    withoutEnlargement: true,
                })
                .jpeg({
                    quality: 70,
                    progressive: true,
                    optimizeCoding: true,
                    mozjpeg: true,
                })
                .toFile(filepath);
        } else {
            // For non-image files, write directly
            await fs.promises.writeFile(filepath, file.buffer);
        }

        const stats = await fs.promises.stat(filepath);
        return {
            filename,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: stats.size,
            path: filepath,
            url: `${this.publicUrl}/${filename}`,
        };
    }

    /**
   * Delete a file from local storage
   * @param {string} filename - Filename to delete
   * @return {Promise<boolean>} Success status
   */
    async delete(filename) {
        const filepath = path.join(this.uploadDir, filename);
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            return true;
        }
        return false;
    }

    /**
   * Get file URL for local storage
   * @param {string} filename - Filename
   * @return {string} File URL
   */
    getFileUrl(filename) {
        return `${this.publicUrl}/${filename}`;
    }

    /**
   * Get file information
   * @param {string} fileId - File identifier
   * @return {Promise<Object|null>} File information or null if not found
   */
    async getInfo(fileId) {
        const filepath = path.join(this.uploadDir, fileId);
        if (fs.existsSync(filepath)) {
            const stats = fs.statSync(filepath);
            return {
                id: fileId,
                url: `${this.publicUrl}/${fileId}`,
                filename: fileId,
                size: stats.size,
                created: stats.birthtime,
            };
        }
        return null;
    }
}

/**
 * Cloudinary storage provider
 */
class CloudinaryStorageProvider extends BaseStorageProvider {
    /**
   * Initialize Cloudinary provider
   * @param {Object} config - Cloudinary configuration
   */
    constructor(config) {
        super();
        cloudinary.config({
            cloud_name: config.cloudName,
            api_key: config.apiKey,
            api_secret: config.apiSecret,
        });
        this.folder = config.folder || 'taskgid';
    }

    /**
   * Upload a file to Cloudinary
   * @param {Object} file - File object
   * @param {Object} options - Upload options
   * @return {Promise<Object>} File information
   */
    async upload(file, options = {}) {
        let buffer = file.buffer;

        // Process image if needed
        if (file.mimetype.startsWith('image/') && options.processImage) {
            buffer = await sharp(file.buffer)
                .resize(options.width || 800, options.height || 800, {
                    fit: 'inside',
                    withoutEnlargement: true,
                })
                .toBuffer();
        }

        const result = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: this.folder,
                    resource_type: 'auto',
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                },
            );

            uploadStream.end(buffer);
        });

        return {
            id: result.public_id,
            url: result.secure_url,
            filename: result.original_filename,
            mimetype: result.resource_type,
            size: result.bytes,
        };
    }

    /**
   * Delete a file from Cloudinary
   * @param {string} cloudinaryId - Cloudinary public ID
   * @return {Promise<boolean>} Success status
   */
    async delete(cloudinaryId) {
        try {
            await cloudinary.uploader.destroy(cloudinaryId);
            return true;
        } catch (error) {
            console.error('Error deleting file from Cloudinary:', error);
            return false;
        }
    }

    /**
   * Get file URL for Cloudinary
   * @param {string} cloudinaryId - Cloudinary public ID
   * @return {string} File URL
   */
    getFileUrl(cloudinaryId) {
        return cloudinary.url(cloudinaryId);
    }

    /**
   * Get file information from Cloudinary
   * @param {string} fileId - Cloudinary public ID
   * @return {Promise<Object|null>} File information or null if not found
   */
    async getInfo(fileId) {
        try {
            const result = await cloudinary.api.resource(fileId);
            return {
                id: result.public_id,
                url: result.secure_url,
                filename: result.original_filename,
                size: result.bytes,
                created: result.created_at,
            };
        } catch (error) {
            console.error('Error getting file info from Cloudinary:', error);
            return null;
        }
    }
}

/**
 * AWS S3 storage provider
 */
class S3StorageProvider extends BaseStorageProvider {
    /**
   * Initialize S3 provider
   * @param {Object} config - S3 configuration
   */
    constructor(config) {
        super();
        this.client = new S3Client({
            region: config.region,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
        });
        this.bucket = config.bucket;
        this.folder = config.folder || 'taskgid';
        this.publicUrl = config.publicUrl;
    }

    /**
   * Generate a unique key for S3
   * @param {string} originalFilename - Original filename
   * @return {string} Unique key
   */
    generateUniqueKey(originalFilename) {
        const timestamp = Date.now();
        const randomString = uuidv4().substring(0, 8);
        const extension = path.extname(originalFilename);
        return `${this.folder}/${timestamp}-${randomString}${extension}`;
    }

    /**
   * Upload a file to S3
   * @param {Object} file - File object
   * @param {Object} options - Upload options
   * @return {Promise<Object>} File information
   */
    async upload(file, options = {}) {
        let buffer = file.buffer;

        // Process image if needed
        if (file.mimetype.startsWith('image/') && options.processImage) {
            buffer = await sharp(file.buffer)
                .resize(options.width || 800, options.height || 800, {
                    fit: 'inside',
                    withoutEnlargement: true,
                })
                .toBuffer();
        }

        const key = this.generateUniqueKey(file.originalname);

        await this.client.send(new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: buffer,
            ContentType: file.mimetype,
        }));

        return {
            id: key,
            url: `${this.publicUrl}/${key}`,
            filename: file.originalname,
            mimetype: file.mimetype,
            size: buffer.length,
        };
    }

    /**
   * Delete a file from S3
   * @param {string} s3Key - S3 key
   * @return {Promise<boolean>} Success status
   */
    async delete(s3Key) {
        try {
            await this.client.send(new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: s3Key,
            }));
            return true;
        } catch (error) {
            console.error('Error deleting file from S3:', error);
            return false;
        }
    }

    /**
   * Get file URL for S3
   * @param {string} s3Key - S3 key
   * @return {string} File URL
   */
    getFileUrl(s3Key) {
        return `${this.publicUrl}/${s3Key}`;
    }

    /**
   * Get file information from S3
   * @param {string} fileId - S3 key
   * @return {Promise<Object|null>} File information or null if not found
   */
    async getInfo(fileId) {
        try {
            const result = await this.client.send(new HeadObjectCommand({
                Bucket: this.bucket,
                Key: fileId,
            }));

            return {
                id: fileId,
                url: `${this.publicUrl}/${fileId}`,
                filename: path.basename(fileId),
                size: result.ContentLength,
                created: result.LastModified,
            };
        } catch (error) {
            console.error('Error getting file info from S3:', error);
            return null;
        }
    }
}

/**
 * Cloudflare R2 storage provider
 */
class CloudflareR2StorageProvider extends BaseStorageProvider {
    /**
   * Initialize Cloudflare R2 provider
   * @param {Object} config - Cloudflare R2 configuration
   */
    constructor(config) {
        super();
        this.client = new S3Client({
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
            endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
            region: 'auto',
            s3ForcePathStyle: true,
        });
        this.bucket = config.bucket;
        this.folder = config.folder || 'taskgid';
        this.publicUrl = config.publicUrl || `https://${config.bucket}.r2.dev`;
    }

    /**
   * Generate a unique key for R2
   * @param {string} originalFilename - Original filename
   * @return {string} Unique key
   */
    generateUniqueKey(originalFilename) {
        const timestamp = Date.now();
        const randomString = uuidv4().substring(0, 8);
        const extension = path.extname(originalFilename);
        return `${this.folder}/${timestamp}-${randomString}${extension}`;
    }

    /**
   * Upload a file to Cloudflare R2
   * @param {Object} file - File object
   * @param {Object} options - Upload options
   * @return {Promise<Object>} File information
   */
    async upload(file, options = {}) {
        const result = await new S3StorageProvider(this.client).upload(file, options);
        return {
            ...result,
            url: `${this.publicUrl}/${result.id}`,
        };
    }

    /**
   * Delete a file from Cloudflare R2
   * @param {string} r2Key - R2 key
   * @return {Promise<boolean>} Success status
   */
    async delete(r2Key) {
        const params = {
            Bucket: this.bucket,
            Key: r2Key,
        };

        try {
            await this.client.send(new DeleteObjectCommand(params));
            return true;
        } catch (error) {
            console.error('Error deleting from Cloudflare R2:', error);
            return false;
        }
    }

    /**
   * Get file URL for Cloudflare R2
   * @param {string} r2Key - R2 key
   * @return {string} File URL
   */
    getFileUrl(r2Key) {
        return `${this.publicUrl}/${r2Key}`;
    }

    /**
   * Get file information from Cloudflare R2
   * @param {string} fileId - R2 key
   * @return {Promise<Object|null>} File information or null if not found
   */
    async getInfo(fileId) {
        const result = await new S3StorageProvider(this.client).getInfo(fileId);
        if (result) {
            return {
                ...result,
                url: `${this.publicUrl}/${fileId}`,
            };
        }
        return null;
    }
}

/**
 * Factory function to create a storage provider
 * @param {string} provider - Provider name
 * @param {Object} config - Provider configuration
 * @return {BaseStorageProvider} Storage provider instance
 */
export function createStorageProvider(provider, config) {
    switch (provider) {
    case 'local':
        return new LocalStorageProvider(config);
    case 'cloudinary':
        return new CloudinaryStorageProvider(config);
    case 's3':
        return new S3StorageProvider(config);
    case 'r2':
        return new CloudflareR2StorageProvider(config);
    default:
        return new LocalStorageProvider(config);
    }
}

export default {
    createStorageProvider,
};
