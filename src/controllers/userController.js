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

/**
 * Placeholder function to retrieve user ID associated with a refresh token.
 * Replace this with your actual refresh token validation and retrieval logic.
 * @param {string} token - The refresh token string.
 * @return {Promise<string|null>} The user ID if found, otherwise null.
 */
async function getUserIdFromRefreshToken(token) {
    // Example: Find user based on a stored opaque token
    // const storedToken = await RefreshTokenModel.findOne({ where: { token: token } });
    // return storedToken ? storedToken.userId : null;
    console.warn(
        'getUserIdFromRefreshToken needs actual implementation! Token received:',
        token,
    );
    // For now, return a placeholder or null, depending on how you want to handle it during development
    return null; // Return null until implemented
}

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

export const editUser = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) {
            return errorResponse(res, 404, 'User not found');
        }

        const username = req.sanitize(req.body.username);
        const firstName = req.sanitize(req.body.firstName);
        const lastName = req.sanitize(req.body.lastName);
        const password = req.body.password;

        // Input validation
        if (!username || !firstName || !lastName) {
            return errorResponse(
                res,
                400,
                'Username, first name, and last name are required',
            );
        }

        // Check username uniqueness
        if (username !== user.username) {
            const usernameExists = await User.findOne({where: {username}});
            if (usernameExists) {
                return errorResponse(res, 400, 'Username already exists');
            }
        }

        // Update user fields
        if (password) {
            if (password.length < 8) {
                return errorResponse(
                    res,
                    400,
                    'Password must be at least 8 characters long',
                );
            }
            user.password = password;
        }

        user.firstName = firstName;
        user.lastName = lastName;
        user.username = username;

        await user.save();
        return successResponse(res, {user});
    } catch (error) {
        console.error('Edit user error:', error);
        return errorResponse(res, 500, 'Failed to update user');
    }
};

export const updateProfilePicture = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) {
            return errorResponse(res, 404, 'User not found');
        }

        // Input validation
        if (!req.body.profile_picture) {
            return errorResponse(res, 400, 'Profile picture URL is required');
        }

        // Validate URL format
        try {
            new URL(req.body.profile_picture);
        } catch (e) {
            return errorResponse(res, 400, 'Invalid profile picture URL');
        }

        user.profilePicture = req.sanitize(req.body.profile_picture);
        await user.save();

        return successResponse(res, {
            message: 'Profile picture updated successfully',
        });
    } catch (error) {
        console.error('Update profile picture error:', error);
        return errorResponse(res, 500, 'Failed to update profile picture');
    }
};
