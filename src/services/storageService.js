const path = require('path');
const crypto = require('crypto');
const storageConfig = require('../config/storage');
const {
  LocalStorageProvider,
  CloudinaryStorageProvider,
  S3StorageProvider,
  R2StorageProvider
} = require('../utils/storageProviders');

/**
 * Storage service for handling file operations
 */
class StorageService {
  constructor() {
    this.provider = this._initializeProvider();
  }

  /**
   * Initialize the storage provider based on configuration
   * @private
   * @returns {BaseStorageProvider} The initialized storage provider
   */
  _initializeProvider() {
    const { provider, local, cloudinary, s3, r2 } = storageConfig;

    switch (provider) {
      case 'local':
        return new LocalStorageProvider(local);
      case 'cloudinary':
        return new CloudinaryStorageProvider(cloudinary);
      case 's3':
        return new S3StorageProvider(s3);
      case 'r2':
        return new R2StorageProvider(r2);
      default:
        throw new Error(`Unsupported storage provider: ${provider}`);
    }
  }

  /**
   * Generate a unique filename for upload
   * @private
   * @param {string} originalFilename - The original filename
   * @returns {string} A unique filename
   */
  _generateUniqueFilename(originalFilename) {
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString('hex');
    const extension = path.extname(originalFilename);
    return `${timestamp}-${randomString}${extension}`;
  }

  /**
   * Upload a file
   * @param {Buffer} fileBuffer - The file buffer
   * @param {string} originalFilename - The original filename
   * @param {string} [folder] - Optional subfolder within the storage
   * @returns {Promise<Object>} Upload result with file details
   */
  async uploadFile(fileBuffer, originalFilename, folder = '') {
    const filename = this._generateUniqueFilename(originalFilename);
    const filePath = folder ? `${folder}/${filename}` : filename;
    
    const result = await this.provider.upload(fileBuffer, filePath);
    return {
      ...result,
      originalFilename,
      filename,
      folder
    };
  }

  /**
   * Delete a file
   * @param {string} filePath - The path of the file to delete
   * @returns {Promise<void>}
   */
  async deleteFile(filePath) {
    await this.provider.delete(filePath);
  }

  /**
   * Get the public URL for a file
   * @param {string} filePath - The path of the file
   * @returns {string} The public URL
   */
  getPublicUrl(filePath) {
    return this.provider.getPublicUrl(filePath);
  }
}

// Export a singleton instance
module.exports = new StorageService(); 