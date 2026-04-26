/**
 * Utility functions for standardized API responses
 */

/**
 * Send an error response with a consistent format
 * @param {object} res - Express response object
 * @param {number} status - HTTP status code
 * @param {string} message - Error message
 * @return {object} JSON response
 */
export const errorResponse = (res, status, message) => {
    let finalMessage = message;
    if (status === 500 && process.env.NODE_ENV === 'production') {
        finalMessage = 'An unexpected error occurred. Please try again later.';
    }
    return res.status(status).json({error: finalMessage, success: false});
};

/**
 * Send a success response with a consistent format
 * @param {object} res - Express response object
 * @param {object} data - Data to send in response
 * @param {number} [statusCode=200] - HTTP status code
 * @return {object} JSON response
 */
export const successResponse = (res, data, statusCode = 200) =>
    res.status(statusCode).json({...data, success: true});
