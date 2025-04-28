import User from '../models/User.js';
import WorkspaceTeam from '../models/WorkspaceTeam.js';
import Auth from '../utils/auth.js';
import emailService from '../utils/emailService.js';
import 'dotenv/config';

const errorResponse = (res, status, message) =>
    res.status(status).json({error: message, success: false});
const successResponse = (res, data, statusCode = 200) =>
    res.status(statusCode).json({...data, success: true});

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

export const login = async (req, res) => {
    try {
        const {email, password} = req.body;
        if (!email || !password) return errorResponse(res, 400, 'Email and password are required');

        const user = await User.findByCredentials(email.toLowerCase(), password);
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
        return errorResponse(res, 401, 'Invalid email or password');
    }
};

export const logout = async (req, res) => {
    try {
        res.clearCookie('refreshToken', Auth.getRefreshTokenCookieOptions());
        return successResponse(res, {message: 'Logged out successfully'});
    } catch (error) {
        return errorResponse(res, 500, 'Logout failed');
    }
};

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

export const getUserIdFromRefreshToken = async (token) => {
    console.warn(
        'getUserIdFromRefreshToken needs actual implementation! Token received:',
        token,
    );

    return null;
};

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
