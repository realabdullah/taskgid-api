import {body, validationResult} from 'express-validator';
import {isSignupAllowed} from '../utils/signupAllowlist.js';

/**
 * Middleware to validate workspace input
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @return {void}
 */
export const validateWorkspaceInput = [
    body('slug')
        .trim()
        .isLength({min: 3, max: 50})
        .withMessage('Slug must be between 3 and 50 characters')
        .matches(/^[a-z0-9-]+$/)
        .withMessage(
            'Slug can only contain lowercase letters, numbers, and hyphens',
        ),
    body('title')
        .trim()
        .isLength({min: 1, max: 100})
        .withMessage('Title must be between 1 and 100 characters'),
    body('description')
        .optional()
        .trim()
        .isLength({max: 500})
        .withMessage('Description cannot exceed 500 characters'),
    body('team').optional().isArray().withMessage('Team must be an array'),

    body('team.*.email')
        .optional()
        .isEmail()
        .withMessage('Invalid email format in team array'),

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
    body('title')
        .trim()
        .isLength({min: 1, max: 200})
        .withMessage('Title must be between 1 and 200 characters'),
    body('description')
        .optional()
        .trim()
        .isLength({max: 1000})
        .withMessage('Description cannot exceed 1000 characters'),
    body('dueDate')
        .optional()
        .isISO8601()
        .withMessage('Due date must be a valid ISO 8601 date'),
    body('priority')
        .optional()
        .isIn(['low', 'medium', 'high'])
        .withMessage('Priority must be low, medium, or high'),
    body('status')
        .optional()
        .isIn(['todo', 'in_progress', 'done'])
        .withMessage('Status must be todo, in_progress, or done'),
    body('startDate')
        .optional({nullable: true})
        .isISO8601()
        .withMessage('Start date must be a valid ISO 8601 date'),
    body('estimateMinutes')
        .optional({nullable: true})
        .isInt({min: 0, max: 60 * 24 * 365})
        .withMessage('Estimate must be a whole number of minutes'),
    body('checklist')
        .optional({nullable: true})
        .isArray({max: 100})
        .withMessage('Checklist must be an array of at most 100 items'),
    body('parentId')
        .optional({nullable: true})
        .isUUID()
        .withMessage('Parent task must be a valid task ID'),
    body('assignees')
        .optional()
        .isArray()
        .withMessage('Assignees must be an array'),

    body('assignees.*')
        .optional()
        .isString()
        .withMessage('Invalid assignee ID format'),

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
    body('email').trim().isEmail().withMessage('Invalid email format'),
    body('workspaceId')
        .optional()
        .isUUID()
        .withMessage('Invalid workspace ID format'),
    body('token')
        .optional()
        .isString()
        .isLength({min: 32, max: 64})
        .withMessage('Invalid invite token format'),
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

export const validateUpdateUserProfile = [
    body('username')
        .optional()
        .trim()
        .isLength({min: 3, max: 30})
        .withMessage('Username must be between 3 and 30 characters.')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('Username can only contain letters, numbers, underscores (_), and hyphens (-).')
        .custom(async (value, {req}) => {
            if (!req.user || value === req.user.username) return true;
            const existingUser = await User.findOne({where: {username: value}});
            if (existingUser) throw new Error('Username already exists.');
            return true;
        }),
    body('firstName')
        .optional()
        .trim()
        .isLength({max: 50})
        .withMessage('First name cannot exceed 50 characters.'),
    body('lastName')
        .optional()
        .trim()
        .isLength({max: 50})
        .withMessage('Last name cannot exceed 50 characters.'),
    body('newPassword')
        .optional()
        .isLength({min: 8})
        .withMessage('New password must be at least 8 characters long.'),
    body('password')
        .custom((value, {req}) => {
            if (req.body.newPassword && !value) {
                throw new Error('Current password is required to set a new password.');
            }
            return true;
        }),
    body('profilePicture')
        .optional()
        .trim()
        .custom((value) => {
            try {
                new URL(value);
                return true;
            } catch (e) {
                if (value.startsWith('data:image/')) return true;
                throw new Error('Profile picture must be a valid URL or a data URL (e.g., data:image/png;base64,...).');
            }
        }),
    body('title')
        .optional({nullable: true})
        .trim()
        .isLength({max: 100})
        .withMessage('Title cannot exceed 100 characters.'),
    body('about')
        .optional({nullable: true})
        .trim()
        .isLength({max: 1000})
        .withMessage('About cannot exceed 1000 characters.'),
    body('location')
        .optional({nullable: true})
        .trim()
        .isLength({max: 100})
        .withMessage('Location cannot exceed 100 characters.'),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array().map((err) => ({
                    field: err.param,
                    message: err.msg,
                    value: (err.param === 'password' || err.param === 'newPassword') ? undefined : err.value,
                })),
            });
        }
        next();
    },
];

export const validateRegisterInput = [
    body('email').trim().isEmail().withMessage('Invalid email format'),
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
    body('username')
        .trim()
        .notEmpty()
        .withMessage('Username is required')
        .isLength({min: 3, max: 30})
        .withMessage('Username must be between 3 and 30 characters'),
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
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

export const validateLoginInput = [
    body('email').trim().isEmail().withMessage('Invalid email format'),
    body('password').notEmpty().withMessage('Password is required'),
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

export const validateRefreshInput = [
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
 * Middleware to validate task input for update operations
 * Fields are all optional for partial updates
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @return {void}
 */
export const validateTaskUpdateInput = [
    body('title')
        .optional()
        .trim()
        .isLength({min: 1, max: 200})
        .withMessage('Title must be between 1 and 200 characters'),
    body('description')
        .optional()
        .trim()
        .isLength({max: 1000})
        .withMessage('Description cannot exceed 1000 characters'),
    body('dueDate')
        .optional()
        .isISO8601()
        .withMessage('Due date must be a valid ISO 8601 date'),
    body('priority')
        .optional()
        .isIn(['low', 'medium', 'high'])
        .withMessage('Priority must be low, medium, or high'),
    body('status')
        .optional()
        .isIn(['todo', 'in_progress', 'done'])
        .withMessage('Status must be todo, in_progress, or done'),
    body('startDate')
        .optional({nullable: true})
        .isISO8601()
        .withMessage('Start date must be a valid ISO 8601 date'),
    body('estimateMinutes')
        .optional({nullable: true})
        .isInt({min: 0, max: 60 * 24 * 365})
        .withMessage('Estimate must be a whole number of minutes'),
    body('checklist')
        .optional({nullable: true})
        .isArray({max: 100})
        .withMessage('Checklist must be an array of at most 100 items'),
    body('parentId')
        .optional({nullable: true})
        .isUUID()
        .withMessage('Parent task must be a valid task ID'),
    body('assignees')
        .optional()
        .isArray()
        .withMessage('Assignees must be an array'),

    body('assignees.*')
        .optional()
        .isString()
        .withMessage('Invalid assignee ID format'),

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
 * Middleware to validate batch task assignment input
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @return {void}
 */
export const validateBatchAssignInput = [
    body('taskIds')
        .isArray({min: 1})
        .withMessage('At least one task ID is required'),
    body('taskIds.*')
        .isUUID()
        .withMessage('Each task ID must be a valid UUID'),
    body('assigneeId')
        .trim()
        .notEmpty()
        .withMessage('Assignee ID is required')
        .isUUID()
        .withMessage('Assignee ID must be a valid UUID'),
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
 * Middleware restricting registration to allowlisted email addresses.
 * No-op when ALLOWED_SIGNUP_EMAILS is unset, so signup stays open by default.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @return {void}
 */
export const validateSignupAllowlist = (req, res, next) => {
    if (isSignupAllowed(req.body?.email)) return next();
    return res.status(403).json({
        success: false,
        error: 'This email address is not approved for signup. ' +
            'Contact an administrator to request access.',
    });
};

const VALID_WEBHOOK_EVENT_TYPES = ['task.created', 'task.updated', 'task.deleted', 'comment.created'];

const reportValidationErrors = (req, res, next) => {
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
};

const webhookDescriptionRule = body('description')
    .optional({nullable: true})
    .trim()
    .isLength({max: 200})
    .withMessage('Description cannot exceed 200 characters');

const webhookEventTypesRule = body('eventTypes')
    .optional()
    .isArray({min: 1})
    .withMessage('eventTypes must be a non-empty array')
    .custom((value) => value.every((type) => VALID_WEBHOOK_EVENT_TYPES.includes(type)))
    .withMessage(`eventTypes must be one of: ${VALID_WEBHOOK_EVENT_TYPES.join(', ')}`);

const webhookIsActiveRule = body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean');

/**
 * Validates a webhook endpoint creation request. URL is required.
 * @return {Array} Express-validator chain plus the error-reporting handler.
 */
export const validateWebhookEndpointCreate = [
    body('url')
        .isURL({protocols: ['https'], require_protocol: true})
        .withMessage('Webhook URL must be a valid https URL'),
    webhookDescriptionRule,
    webhookEventTypesRule,
    webhookIsActiveRule,
    reportValidationErrors,
];

/**
 * Validates a webhook endpoint update request. Every field, including URL, is optional.
 * @return {Array} Express-validator chain plus the error-reporting handler.
 */
export const validateWebhookEndpointUpdate = [
    body('url')
        .optional()
        .isURL({protocols: ['https'], require_protocol: true})
        .withMessage('Webhook URL must be a valid https URL'),
    webhookDescriptionRule,
    webhookEventTypesRule,
    webhookIsActiveRule,
    reportValidationErrors,
];

/**
 * Validates a Slack installation update. Every field is optional.
 * @return {Array} Express-validator chain plus the error-reporting handler.
 */
export const validateSlackInstallationUpdate = [
    body('channelId')
        .optional({nullable: true})
        .custom((value) => value === null || value === '' || (typeof value === 'string' && value.length > 0))
        .withMessage('channelId must be a string or null'),
    body('eventTypes')
        .optional()
        .isArray({min: 1})
        .withMessage('eventTypes must be a non-empty array')
        .custom((value) => value.every((type) => VALID_WEBHOOK_EVENT_TYPES.includes(type)))
        .withMessage(`eventTypes must be one of: ${VALID_WEBHOOK_EVENT_TYPES.join(', ')}`),
    body('isActive')
        .optional()
        .isBoolean()
        .withMessage('isActive must be a boolean'),
    reportValidationErrors,
];
