import path from 'path';

/**
 * Lazy-load sharp to avoid crashing on startup if native binary is missing
 * @return {Promise<Object>} sharp module
 */
async function getSharp() {
    try {
        const mod = await import('sharp');
        return mod.default;
    } catch {
        throw new Error('sharp module unavailable for the current platform. Image processing disabled.');
    }
}
import {v4 as uuidv4} from 'uuid';
import {S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand} from '@aws-sdk/client-s3';

/**
 * Cloudflare R2 storage provider
 */
class CloudflareR2StorageProvider {
    /**
   * Initialize Cloudflare R2 provider
   * @param {Object} config - Cloudflare R2 configuration
   */
    constructor(config) {
        if (!config.accessKeyId || !config.secretAccessKey || !config.accountId || !config.bucket) {
            throw new Error('Cloudflare R2 configuration is incomplete');
        }

        this.client = new S3Client({
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
            endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
            region: 'auto',
            forcePathStyle: true,
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
        let buffer = file.buffer;

        // Process image if needed
        if (file.mimetype.startsWith('image/') && options.processImage) {
            const sharp = await getSharp();
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
   * Delete a file from Cloudflare R2
   * @param {string} r2Key - R2 key
   * @return {Promise<boolean>} Success status
   */
    async delete(r2Key) {
        try {
            await this.client.send(new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: r2Key,
            }));
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
            console.error('Error getting file info from R2:', error);
            return null;
        }
    }
}

export default CloudflareR2StorageProvider;
