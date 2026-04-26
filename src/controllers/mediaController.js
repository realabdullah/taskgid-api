import { successResponse, errorResponse } from '../utils/responseUtils.js';

/**
 * Handle generic file upload
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @return {Object} Response with file information
 */
export const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return errorResponse(res, 400, 'No file uploaded');
    }

    // req.uploadedFile is populated by the uploadSingle middleware
    const fileData = req.uploadedFile;

    return successResponse(res, {
      message: 'File uploaded successfully',
      file: fileData
    });
  } catch (error) {
    console.error('File Upload Error:', error);
    return errorResponse(res, 500, 'Failed to upload file');
  }
};

/**
 * Handle multiple file uploads
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @return {Object} Response with files information
 */
export const uploadFiles = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return errorResponse(res, 400, 'No files uploaded');
    }

    // req.uploadedFiles is populated by the uploadMultiple middleware
    const filesData = req.uploadedFiles;

    return successResponse(res, {
      message: 'Files uploaded successfully',
      files: filesData
    });
  } catch (error) {
    console.error('Files Upload Error:', error);
    return errorResponse(res, 500, 'Failed to upload files');
  }
};
