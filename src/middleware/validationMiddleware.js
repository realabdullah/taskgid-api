import {body, validationResult} from 'express-validator';

/**
 * Middleware to validate workspace input
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @return {void}
 */
export const validateWorkspaceInput = [
    // Validate slug
    body('slug')
        .trim()
        .isLength({min: 3, max: 50})
        .withMessage('Slug must be between 3 and 50 characters')
        .matches(/^[a-z0-9-]+$/)
        .withMessage(
            'Slug can only contain lowercase letters, numbers, and hyphens',
        ),

    // Validate title
    body('title')
        .trim()
        .isLength({min: 1, max: 100})
        .withMessage('Title must be between 1 and 100 characters'),

    // Validate description (optional)
    body('description')
        .optional()
        .trim()
        .isLength({max: 500})
        .withMessage('Description cannot exceed 500 characters'),

    // Validate team (optional)
    body('team').optional().isArray().withMessage('Team must be an array'),

    body('team.*.email')
        .optional()
        .isEmail()
        .withMessage('Invalid email format in team array'),

    // Check for validation errors
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array().map((err) => ({
                    field: err.param,
                    message: err.msg,
                })),
            });
        }
        next();
    },
];

/**
 * Middleware to validate task input
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @return {void}
 */
export const validateTaskInput = [
    // Validate title
    body('title')
        .trim()
        .isLength({min: 1, max: 200})
        .withMessage('Title must be between 1 and 200 characters'),

    // Validate description (optional)
    body('description')
        .optional()
        .trim()
        .isLength({max: 1000})
        .withMessage('Description cannot exceed 1000 characters'),

    // Validate due date (optional)
    body('dueDate')
        .optional()
        .isISO8601()
        .withMessage('Due date must be a valid ISO 8601 date'),

    // Validate priority (optional)
    body('priority')
        .optional()
        .isIn(['low', 'medium', 'high'])
        .withMessage('Priority must be low, medium, or high'),

    // Validate status (optional)
    body('status')
        .optional()
        .isIn(['todo', 'in_progress', 'done'])
        .withMessage('Status must be todo, in_progress, or done'),

    // Validate assignees (optional)
    body('assignees')
        .optional()
        .isArray()
        .withMessage('Assignees must be an array'),

    body('assignees.*')
        .optional()
        .isUUID()
        .withMessage('Invalid assignee ID format'),

    // Check for validation errors
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array().map((err) => ({
                    field: err.param,
                    message: err.msg,
                })),
            });
        }
        next();
    },
];

/**
 * Middleware to validate comment input
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @return {void}
 */
export const validateCommentInput = [
    // Validate content
    body('content')
        .trim()
        .isLength({min: 1, max: 1000})
        .withMessage('Comment must be between 1 and 1000 characters'),

    // Check for validation errors
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array().map((err) => ({
                    field: err.param,
                    message: err.msg,
                })),
            });
        }
        next();
    },
];

/**
 * Middleware to validate invite input
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @return {void}
 */
export const validateInviteInput = [
    // Validate email
    body('email').trim().isEmail().withMessage('Invalid email format'),

    // Validate workspaceId (for invite creation)
    body('workspaceId')
        .optional()
        .isUUID()
        .withMessage('Invalid workspace ID format'),

    // Validate token (for invite acceptance)
    body('token')
        .optional()
        .isString()
        .isLength({min: 32, max: 64})
        .withMessage('Invalid invite token format'),

    // Check for validation errors
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array().map((err) => ({
                    field: err.param,
                    message: err.msg,
                })),
            });
        }
        next();
    },
];

/**
 * Middleware to validate user input
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @return {void}
 */
export const validateUserInput = [
    // Validate firstName
    body('firstName')
        .trim()
        .isLength({min: 1, max: 50})
        .withMessage('First name must be between 1 and 50 characters'),

    // Validate lastName
    body('lastName')
        .trim()
        .isLength({min: 1, max: 50})
        .withMessage('Last name must be between 1 and 50 characters'),

    // Validate username (optional)
    body('username')
        .optional()
        .trim()
        .isLength({min: 3, max: 30})
        .withMessage('Username must be between 3 and 30 characters')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage(
            'Username can only contain letters, numbers, underscores, and hyphens',
        ),

    // Validate email (optional)
    body('email').optional().trim().isEmail().withMessage('Invalid email format'),

    // Check for validation errors
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array().map((err) => ({
                    field: err.param,
                    message: err.msg,
                })),
            });
        }
        next();
    },
];

/**
 * Middleware to validate profile picture input
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @return {void}
 */
export const validateProfilePictureInput = [
    // Validate profilePicture
    body('profilePicture')
        .isBase64()
        .withMessage('Profile picture must be a valid base64 string')
        .custom((value) => {
            // Check if the base64 string starts with a valid image data URL
            if (!value.startsWith('data:image/')) {
                throw new Error('Profile picture must be a valid image file');
            }
            return true;
        }),

    // Check for validation errors
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array().map((err) => ({
                    field: err.param,
                    message: err.msg,
                })),
            });
        }
        next();
    },
];

/**
 * Middleware to validate authentication input
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @return {void}
 */
export const validateAuthInput = [
    // Validate email
    body('email').trim().isEmail().withMessage('Invalid email format'),

    // Validate password
    body('password')
        .isLength({min: 8})
        .withMessage('Password must be at least 8 characters long')
        .matches(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
        )
        .withMessage(
            'Password must contain at least one uppercase letter, one lowercase letter, ' +
            'one number, and one special character',
        ),

    // Check for validation errors
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array().map((err) => ({
                    field: err.param,
                    message: err.msg,
                })),
            });
        }
        next();
    },
];
