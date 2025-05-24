import User from '../models/User.js';
import TwoFactorAuth from '../models/TwoFactorAuth.js';
import WorkspaceTeam from '../models/WorkspaceTeam.js';
import Auth from '../utils/auth.js';
import emailService from '../utils/emailService.js';
import {errorResponse, successResponse} from '../utils/responseUtils.js';
import {verifyTOTPToken, isBackupCode, formatBackupCode} from '../utils/twoFactorAuth.js';
import 'dotenv/config';

/**
 * Register a new user
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body with user registration data
 * @param {string} req.body.email - User email
 * @param {string} req.body.password - User password
 * @param {string} req.body.firstName - User first name
 * @param {string} req.body.lastName - User last name
 * @param {string} req.body.username - User username
 * @param {Object} res - Express response object
 * @return {Object} Response with user data and tokens or error
 */
export const register = async (req, res) => {
    try {
        const {email, password, firstName, lastName, username} = req.body;

        if (!email || !password || !firstName || !lastName || !username) {
            return errorResponse(
                res,
                400,
                'Email, password, first name, last name, and username are required',
            );
        }
        if (!/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
            return errorResponse(res, 400, 'Invalid email format');
        }
        if (password.length < 8) {
            return errorResponse(
                res,
                400,
                'Password must be at least 8 characters long',
            );
        }
        const usernameRegex = /^[a-zA-Z0-9_]+$/;
        if (!usernameRegex.test(username)) {
            return errorResponse(
                res,
                400,
                'Username can only contain letters, numbers, and underscores',
            );
        }

        const sanitizedEmail = req.sanitize(email).toLowerCase();
        const sanitizedFirstName = req.sanitize(firstName);
        const sanitizedLastName = req.sanitize(lastName);
        const sanitizedUsername = req.sanitize(username);

        const user = await User.create({
            email: sanitizedEmail,
            password,
            firstName: sanitizedFirstName,
            lastName: sanitizedLastName,
            username: sanitizedUsername,
        });

        try {
            await emailService.sendWelcomeEmail(user);
        } catch (emailError) {
            console.error('Failed to send welcome email:', emailError);
        }

        const tokens = await Auth.generateTokenPair(user);
        res.cookie(
            'refreshToken',
            tokens.refreshToken,
            Auth.getRefreshTokenCookieOptions(),
        );

        return successResponse(res, {
            user,
            accessToken: {token: tokens.accessToken, expiresIn: tokens.expiresIn},
        });
    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            const field = error.errors?.[0]?.path || 'email or username';
            return errorResponse(
                res,
                400,
                `An account with this ${field} already exists.`,
            );
        }
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map((err) => err.message);
            return errorResponse(res, 400, errors.join(', '));
        }
        return errorResponse(
            res,
            500,
            'Registration failed due to an internal error.',
        );
    }
};

/**
 * Authenticate a user and provide access tokens
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.email - User email
 * @param {string} req.body.password - User password
 * @param {string} [req.body.twoFactorToken] - 2FA token (TOTP or backup code)
 * @param {Object} res - Express response object
 * @return {Object} Response with user data and tokens or error
 */
export const login = async (req, res) => {
    try {
        const {email, password, twoFactorToken} = req.body;
        if (!email || !password) return errorResponse(res, 400, 'Email and password are required');

        const user = await User.findByCredentials(email.toLowerCase(), password);

        // Check if user has 2FA enabled
        const twoFactorAuth = await TwoFactorAuth.findOne({
            where: {userId: user.id},
            attributes: ['isEnabled', 'secret', 'backupCodes', 'lastUsedAt'],
        });

        // If 2FA is enabled, require verification
        if (twoFactorAuth && twoFactorAuth.isEnabled) {
            if (!twoFactorToken) {
                return errorResponse(res, 428, 'Two-factor authentication code is required', {
                    requiresTwoFactor: true,
                    userId: user.id, // Temporary identifier for 2FA verification
                    message: 'Please provide your 6-digit authenticator code or backup code',
                });
            }

            // Verify the 2FA token
            let isValidAuth = false;
            let tokenType = 'unknown';

            if (isBackupCode(twoFactorToken)) {
                // Handle backup code
                const formattedCode = formatBackupCode(twoFactorToken);
                isValidAuth = twoFactorAuth.useBackupCode(formattedCode);
                tokenType = 'backup_code';

                if (isValidAuth) {
                    await twoFactorAuth.save();
                }
            } else {
                // Handle TOTP token
                isValidAuth = verifyTOTPToken(twoFactorToken, twoFactorAuth.secret);
                tokenType = 'totp';
            }

            if (!isValidAuth) {
                return errorResponse(res, 401, 'Invalid two-factor authentication code', {
                    requiresTwoFactor: true,
                    errorType: 'invalid_2fa_code',
                    tokenType: tokenType,
                });
            }

            // Update last used timestamp
            await twoFactorAuth.update({lastUsedAt: new Date()});

            // Check if backup codes are running low
            if (tokenType === 'backup_code' && twoFactorAuth.isBackupCodesLow()) {
                // Include warning in response
                const tokens = await Auth.generateTokenPair(user);

                return successResponse(res, {
                    user,
                    accessToken: {
                        token: tokens.accessToken,
                        expires: tokens.expiresIn,
                    },
                    refreshToken: {
                        token: tokens.refreshToken,
                    },
                    warning: {
                        type: 'backup_codes_low',
                        message: 'You have less than 3 backup codes remaining. Consider regenerating them.',
                        backupCodesRemaining: twoFactorAuth.backupCodes.length,
                    },
                });
            }
        }

        // Generate tokens for successful authentication
        const tokens = await Auth.generateTokenPair(user);

        return successResponse(res, {
            user,
            accessToken: {
                token: tokens.accessToken,
                expires: tokens.expiresIn,
            },
            refreshToken: {
                token: tokens.refreshToken,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        return errorResponse(res, 401, 'Invalid email or password');
    }
};

/**
 * Log out a user by clearing refresh token cookie
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @return {Object} Response with success message or error
 */
export const logout = async (req, res) => {
    try {
        res.clearCookie('refreshToken', Auth.getRefreshTokenCookieOptions());
        return successResponse(res, {message: 'Logged out successfully'});
    } catch (error) {
        return errorResponse(res, 500, 'Logout failed');
    }
};

/**
 * Refresh access token using refresh token
 * @param {Object} req - Express request object
 * @param {Object} req.cookies - Request cookies
 * @param {string} req.cookies.refreshToken - Refresh token
 * @param {Object} res - Express response object
 * @return {Object} Response with new access token or error
 */
export const refresh = async (req, res) => {
    const oldRefreshToken = req.cookies.refreshToken;

    if (!oldRefreshToken) return errorResponse(res, 401, 'Refresh token not found');

    try {
        const userId = await getUserIdFromRefreshToken(oldRefreshToken);
        if (!userId) {
            res.clearCookie('refreshToken', Auth.getRefreshTokenCookieOptions());
            return errorResponse(res, 401, 'Invalid refresh token');
        }

        const user = await User.findByPk(userId);
        if (!user) {
            res.clearCookie('refreshToken', Auth.getRefreshTokenCookieOptions());
            return errorResponse(res, 401, 'User not found for this token');
        }

        const tokens = await Auth.generateTokenPair(user);

        res.cookie('refreshToken', tokens.refreshToken, Auth.getRefreshTokenCookieOptions());
        return successResponse(res, {accessToken: {token: tokens.accessToken, expiresIn: tokens.expiresIn}});
    } catch (error) {
        res.clearCookie('refreshToken', Auth.getRefreshTokenCookieOptions());
        if (error.message.includes('Invalid') || error.message.includes('expired')
        ) {
            return errorResponse(res, 401, 'Token refresh failed: ' + error.message);
        }
        return errorResponse(
            res,
            500,
            'Token refresh failed due to an internal error.',
        );
    }
};

/**
 * Get user ID from refresh token
 * @param {string} token - Refresh token
 * @return {string|null} - User ID or null if token is invalid
 */
export const getUserIdFromRefreshToken = async (token) => {
    console.warn(
        'getUserIdFromRefreshToken needs actual implementation! Token received:',
        token,
    );

    return null;
};

/**
 * Get the authenticated user's profile with workspace count
 * @param {Object} req - Express request object
 * @param {Object} req.user - Authenticated user
 * @param {Object} res - Express response object
 * @return {Object} Response with user data or error
 */
export const getUser = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) return errorResponse(res, 404, 'User not found');

        const workspaceCount = await WorkspaceTeam.count({
            where: {userId: req.user.id},
        });
        return successResponse(res, {user: {...user.toJSON(), workspaceCount}});
    } catch (error) {
        console.log('failed: ', error);
        return errorResponse(res, 500, 'Failed to fetch user');
    }
};

/**
 * Update the authenticated user's profile
 * @param {Object} req - Express request object
 * @param {Object} req.user - Authenticated user
 * @param {Object} req.body - Request body with fields to update
 * @param {string} [req.body.username] - Updated username
 * @param {string} [req.body.firstName] - Updated first name
 * @param {string} [req.body.lastName] - Updated last name
 * @param {string} [req.body.profilePicture] - Updated profile picture URL
 * @param {string} [req.body.title] - Updated title
 * @param {string} [req.body.about] - Updated about text
 * @param {string} [req.body.location] - Updated location
 * @param {string} [req.body.password] - Current password (required for password change)
 * @param {string} [req.body.newPassword] - New password
 * @param {Object} res - Express response object
 * @return {Object} Response with updated user data or error
 */
export const updateUserProfile = async (req, res) => {
    try {
        const allowedUpdateFields = [
            'username',
            'firstName',
            'lastName',
            'profilePicture',
            'title',
            'about',
            'location',
        ];

        const userId = req.user.id;
        if (!userId) return errorResponse(res, 401, 'Authentication required.');

        const user = await User.findByPk(userId);
        if (!user) return errorResponse(res, 404, 'User not found');

        const updates = {};
        const validationErrors = [];
        let passwordChangeValidated = false;
        let newPasswordValue = null;

        const currentPasswordAttempt = req.body.password;
        const newPasswordAttempt = req.body.newPassword;

        if (newPasswordAttempt) {
            if (!currentPasswordAttempt) {
                validationErrors.push(
                    'Current password is required to set a new password.',
                );
            } else if (
                typeof newPasswordAttempt !== 'string' ||
        newPasswordAttempt.length < 8
            ) {
                validationErrors.push(
                    'New password must be a string and at least 8 characters long.',
                );
            } else {
                if (validationErrors.length === 0) {
                    const isMatch = await user.isPasswordMatch(currentPasswordAttempt);
                    if (!isMatch) validationErrors.push('Incorrect current password.');
                    else {
                        passwordChangeValidated = true;
                        newPasswordValue = newPasswordAttempt;
                    }
                }
            }
        } else if (currentPasswordAttempt) {
            validationErrors.push(
                'New password is required when providing the current password for a change.',
            );
        }

        for (const field of allowedUpdateFields) {
            if (Object.prototype.hasOwnProperty.call(req.body, field)) {
                let value = req.body[field];

                const nullableFields = ['title', 'about', 'location'];
                if (value === null && nullableFields.includes(field)) {
                    updates[field] = null;
                    continue;
                }

                value = req.sanitize(value);

                switch (field) {
                case 'username':
                    if (typeof value !== 'string' || !value) {
                        validationErrors.push('Username cannot be empty.');
                    } else if (value.length < 3 || value.length > 30) {
                        validationErrors.push(
                            'Username must be between 3 and 30 characters.',
                        );
                    } else if (value !== user.username) {
                        const usernameExists = await User.findOne({
                            where: {username: value},
                        });
                        if (usernameExists) {
                            validationErrors.push('Username already exists.');
                        } else updates.username = value;
                    }
                    break;

                case 'firstName':
                case 'lastName':
                    if (typeof value === 'string') updates[field] = value;
                    else validationErrors.push(`${field} must be a string.`);
                    break;

                case 'profilePicture':
                    if (typeof value === 'string' && value !== '') {
                        try {
                            if (
                                field === 'profilePicture' &&
                  value.startsWith('data:image/')
                            ) {
                                updates[field] = value;
                            } else {
                                new URL(value);
                                updates[field] = value;
                            }
                        } catch (e) {
                            validationErrors.push(`Invalid URL format for ${field}.`);
                        }
                    } else validationErrors.push(`${field} must be a string (URL).`);
                    break;

                case 'title':
                case 'about':
                case 'location':
                    if (typeof value === 'string') updates[field] = value;
                    else if (value !== null) {
                        validationErrors.push(`${field} must be a string.`);
                    }
                    break;
                }
            }
        }

        if (validationErrors.length > 0) {
            return errorResponse(res, 400, validationErrors.join(' '));
        }

        const hasProfileUpdates = Object.keys(updates).length > 0;
        if (!hasProfileUpdates && !passwordChangeValidated) {
            return successResponse(res, {
                message: 'No changes detected or applied.',
                user: user.toJSON(),
            });
        }

        if (hasProfileUpdates) Object.assign(user, updates);
        if (passwordChangeValidated && newPasswordValue) {
            user.password = newPasswordValue;
        }
        await user.save();

        return successResponse(res, {
            message: 'Profile updated successfully',
            user: user.toJSON(),
        });
    } catch (error) {
        if (
            error.name === 'SequelizeValidationError' ||
      error.name === 'SequelizeUniqueConstraintError'
        ) {
            const messages = error.errors.map((e) => e.message);
            return errorResponse(res, 400, messages.join(', '));
        }
        return errorResponse(res, 500, 'Failed to update profile');
    }
};

/**
 * Update FCM token for the authenticated user
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.fcmToken - FCM token to update
 * @param {Object} req.user - Authenticated user
 * @param {Object} res - Express response object
 * @return {Object} Response with success message or error
 */
export const updateFCMToken = async (req, res) => {
    try {
        const {fcmToken} = req.body;
        const userId = req.user.id;

        if (!fcmToken) {
            return errorResponse(res, 400, 'FCM token is required');
        }

        await User.update(
            {fcmToken},
            {where: {id: userId}},
        );

        return successResponse(res, 200, 'FCM token updated successfully');
    } catch (error) {
        console.error('Update FCM Token Error:', error);
        return errorResponse(res, 500, 'Failed to update FCM token');
    }
};

/**
 * Update Knock token for the authenticated user
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.knockToken - Knock token to update
 * @param {Object} req.user - Authenticated user
 * @param {Object} res - Express response object
 * @return {Object} Response with success message or error
 */
export const updateKnockToken = async (req, res) => {
    try {
        const {knockToken} = req.body;
        const userId = req.user.id;

        if (!knockToken) {
            return errorResponse(res, 400, 'Knock token is required');
        }

        await User.update(
            {knockToken},
            {where: {id: userId}},
        );

        return successResponse(res, 200, 'Knock token updated successfully');
    } catch (error) {
        console.error('Update Knock Token Error:', error);
        return errorResponse(res, 500, 'Failed to update Knock token');
    }
};
