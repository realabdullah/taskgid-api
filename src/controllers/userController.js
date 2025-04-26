import User from '../models/User.js';
import Auth from '../utils/auth.js';
import emailService from '../utils/emailService.js';
import 'dotenv/config';

// Define response helpers locally
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
        console.error('Registration error:', error);
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
        if (!email || !password) {
            return errorResponse(res, 400, 'Email and password are required');
        }

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
        console.error('Login error:', error);
        return errorResponse(res, 401, 'Invalid email or password');
    }
};

export const logout = async (req, res) => {
    try {
    // Invalidate the refresh token on the server-side (needs implementation)
    // e.g., await invalidateRefreshToken(req.cookies.refreshToken);
    // For now, just clear the cookie
        res.clearCookie('refreshToken', Auth.getRefreshTokenCookieOptions());
        // Maybe add token to a blacklist if implementing that strategy
        return successResponse(res, {message: 'Logged out successfully'});
    } catch (error) {
        console.error('Logout error:', error);
        return errorResponse(res, 500, 'Logout failed');
    }
};

export const refresh = async (req, res) => {
    const oldRefreshToken = req.cookies.refreshToken;

    if (!oldRefreshToken) {
        return errorResponse(res, 401, 'Refresh token not found');
    }

    try {
    // --- Refresh Token Validation Logic ---
    // This needs to be implemented based on how you store and validate refresh tokens.
    // Option 1: Opaque tokens stored in DB (Recommended)
    // const storedToken = await RefreshTokenModel.findOne({ where: { token: oldRefreshToken } });
    // if (!storedToken || storedToken.expiresAt < new Date() || storedToken.isRevoked) {
    //     res.clearCookie('refreshToken', Auth.getRefreshTokenCookieOptions());
    //     return errorResponse(res, 401, 'Invalid or expired refresh token');
    // }
    // const userId = storedToken.userId;

        // Option 2: JWT Refresh Tokens (Less common for long-lived tokens, requires separate secret)
        // let decoded;
        // try {
        //     decoded = jwt.verify(oldRefreshToken, config.jwt.refreshSecret); // Use a dedicated refresh secret
        // } catch (err) {
        //     res.clearCookie('refreshToken', Auth.getRefreshTokenCookieOptions());
        //     return errorResponse(res, 401, 'Invalid or expired refresh token');
        // }
        // const userId = decoded.id;
        // --- End Validation Logic Placeholder ---

        // Placeholder: Assume validation passed and userId is extracted
        // Replace this with actual validation logic from above
        const userId = await getUserIdFromRefreshToken(oldRefreshToken); // Needs implementation
        if (!userId) {
            res.clearCookie('refreshToken', Auth.getRefreshTokenCookieOptions());
            return errorResponse(res, 401, 'Invalid refresh token');
        }

        const user = await User.findByPk(userId);
        if (!user) {
            res.clearCookie('refreshToken', Auth.getRefreshTokenCookieOptions());
            return errorResponse(res, 401, 'User not found for this token');
        }

        // Generate new token pair
        const tokens = await Auth.generateTokenPair(user);

        // --- Refresh Token Rotation (Optional but Recommended) ---
        // Invalidate the old refresh token and store the new one
        // await invalidateRefreshToken(oldRefreshToken);
        // await storeNewRefreshToken(tokens.refreshToken, user.id);
        // --- End Rotation Placeholder ---

        // Set the new refresh token cookie
        res.cookie(
            'refreshToken',
            tokens.refreshToken,
            Auth.getRefreshTokenCookieOptions(),
        );

        // Send the new access token
        return successResponse(res, {
            accessToken: {
                token: tokens.accessToken,
                expiresIn: tokens.expiresIn,
            },
        });
    } catch (error) {
        console.error('Token refresh error:', error);
        // Clear the potentially invalid refresh token cookie as a precaution
        res.clearCookie('refreshToken', Auth.getRefreshTokenCookieOptions());
        // Differentiate between validation errors and other errors
        if (
            error.message.includes('Invalid') ||
      error.message.includes('expired')
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
    // Example: Find user based on a stored opaque token
    // const storedToken = await RefreshTokenModel.findOne({ where: { token: token } });
    // return storedToken ? storedToken.userId : null;
    console.warn(
        'getUserIdFromRefreshToken needs actual implementation! Token received:',
        token,
    );
    // For now, return a placeholder or null, depending on how you want to handle it during development
    return null; // Return null until implemented
};

export const getUser = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) {
            return errorResponse(res, 404, 'User not found');
        }
        return successResponse(res, {user});
    } catch (error) {
        console.error('Get user error:', error);
        return errorResponse(res, 500, 'Failed to fetch user');
    }
};

export const updateUserProfile = async (req, res) => {
    try {
        const allowedUpdateFields = [
            'username',
            'firstName',
            'lastName',
            'password',
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
                        validationErrors.push('Username must be between 3 and 30 characters.');
                    } else if (value !== user.username) {
                        const usernameExists = await User.findOne({where: {username: value}});
                        if (usernameExists) validationErrors.push('Username already exists.');
                        else updates.username = value;
                    }
                    break;

                case 'password':
                    if (value && typeof value === 'string') {
                        if (value.length < 8) validationErrors.push('New password must be at least 8 characters long.');
                        else updates.password = value;
                    } else if (value) validationErrors.push('Invalid password format.');
                    break;

                case 'firstName':
                case 'lastName':
                    if (typeof value === 'string') updates[field] = value;
                    else validationErrors.push(`${field} must be a string.`);
                    break;

                case 'profilePicture':
                    if (typeof value === 'string' && value !== '') {
                        try {
                            if (field === 'profilePicture' && value.startsWith('data:image/')) {
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
                    else if (value !== null) validationErrors.push(`${field} must be a string.`);
                    break;

                default:
                    console.warn(`Unhandled allowed field: ${field}`);
                }
            }
        }

        if (validationErrors.length > 0) return errorResponse(res, 400, validationErrors.join(' '));
        if (Object.keys(updates).length === 0) {
            return successResponse(res, {message: 'No changes detected or applied.', user: user.toJSON()});
        }

        Object.assign(user, updates);
        await user.save();

        return successResponse(res, {message: 'Profile updated successfully', user: user.toJSON()});
    } catch (error) {
        console.error('Update user profile error:', error);
        if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
            const messages = error.errors.map((e) => e.message);
            return errorResponse(res, 400, messages.join(', '));
        }
        return errorResponse(res, 500, 'Failed to update profile');
    }
};
