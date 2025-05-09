/**
 * Utility functions for standardized API responses
 */

/**
 * Send an error response with a consistent format
 * @param {Object} res - Express response object
 * @param {number} status - HTTP status code
 * @param {string} message - Error message
 * @return {Object} JSON response
 */
export const errorResponse = (res, status, message) =>
    res.status(status).json({error: message, success: false});

/**
 * Send a success response with a consistent format
 * @param {Object} res - Express response object
 * @param {Object} data - Data to send in response
 * @param {number} statusCode - HTTP status code (defaults to 200)
 * @return {Object} JSON response
 */
export const successResponse = (res, data, statusCode = 200) =>
    res.status(statusCode).json({...data, success: true});
