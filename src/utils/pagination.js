/**
 * Utility functions for handling pagination
 */

/**
 * Parse pagination parameters from request query
 * @param {Object} query - Request query object
 * @param {Object} options - Options for pagination
 * @param {number} options.defaultPage - Default page number (default: 1)
 * @param {number} options.defaultLimit - Default items per page (default: 10)
 * @param {number} options.maxLimit - Maximum items per page (default: 100)
 * @return {Object} Pagination parameters
 */
export const getPaginationParams = (query, options = {}) => {
    const {
        defaultPage = 1,
        defaultLimit = 10,
        maxLimit = 100,
    } = options;

    const page = Math.max(1, parseInt(query.page) || defaultPage);
    const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit) || defaultLimit));
    const offset = (page - 1) * limit;

    return {page, limit, offset};
};

/**
 * Create pagination metadata for response
 * @param {number} total - Total number of items
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @return {Object} Pagination metadata
 */
export const createPaginationMetadata = (total, page, limit) => {
    const totalPages = Math.ceil(total / limit);

    return {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
    };
};

/**
 * Create a paginated response
 * @param {Array} data - Array of items
 * @param {number} total - Total number of items
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @param {string} dataKey - Key to use for the data in the response (default: 'data')
 * @return {Object} Paginated response object
 */
export const createPaginatedResponse = (data, total, page, limit, dataKey = 'data') => {
    const pagination = createPaginationMetadata(total, page, limit);

    return {
        success: true,
        [dataKey]: data,
        pagination,
    };
};
