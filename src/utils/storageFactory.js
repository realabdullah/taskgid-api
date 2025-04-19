/**
 * Storage factory for creating storage provider instances
 */

const storageConfig = require('../config/storageConfig');
const LocalStorageProvider = require('./storageProviders').LocalStorageProvider;
const CloudinaryStorageProvider = require('./storageProviders').CloudinaryStorageProvider;
const S3StorageProvider = require('./storageProviders').S3StorageProvider;
const R2StorageProvider = require('./storageProviders').R2StorageProvider;

/**
 * Creates and returns a storage provider instance based on configuration
 * @return {Object} An instance of the configured storage provider
 * @throws {Error} If the configured provider is not supported
 */
function createStorageProvider() {
    const provider = storageConfig.provider.toLowerCase();

    switch (provider) {
    case 'local':
        return new LocalStorageProvider(storageConfig.local);

    case 'cloudinary':
        if (!storageConfig.cloudinary.cloudName ||
          !storageConfig.cloudinary.apiKey ||
          !storageConfig.cloudinary.apiSecret) {
            throw new Error('Cloudinary configuration is incomplete');
        }
        return new CloudinaryStorageProvider(storageConfig.cloudinary);

    case 's3':
        if (!storageConfig.s3.region ||
          !storageConfig.s3.accessKeyId ||
          !storageConfig.s3.secretAccessKey ||
          !storageConfig.s3.bucket) {
            throw new Error('S3 configuration is incomplete');
        }
        return new S3StorageProvider(storageConfig.s3);

    case 'r2':
        if (!storageConfig.r2.accountId ||
          !storageConfig.r2.accessKeyId ||
          !storageConfig.r2.secretAccessKey ||
          !storageConfig.r2.bucket) {
            throw new Error('R2 configuration is incomplete');
        }
        return new R2StorageProvider(storageConfig.r2);

    default:
        throw new Error(`Unsupported storage provider: ${provider}`);
    }
}

// Create a singleton instance
const storageProvider = createStorageProvider();

module.exports = storageProvider;
