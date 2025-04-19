import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import {createWorkspace} from './workspaceController.js';
import {sendWelcomeNotification} from '../services/knock.js';
import 'dotenv/config';

// Security constants
const TOKEN_EXPIRY = {
    access: 60 * 60 * 1000, // 1 hour
    refresh: 30 * 24 * 60 * 60 * 1000, // 30 days
};

// Helper function for consistent error responses
const errorResponse = (res, status, message) => {
    return res.status(status).json({
        error: message,
        success: false,
    });
};

// Helper function for successful responses
const successResponse = (res, data) => {
    return res.json({
        success: true,
        ...data,
    });
};

export const register = async (req, res) => {
    try {
        // Input validation
        if (!req.body.firstName || !req.body.lastName || !req.body.email || !req.body.password || !req.body.username) {
            return errorResponse(res, 400, 'Missing required fields');
        }

        const firstName = req.sanitize(req.body.firstName);
        const lastName = req.sanitize(req.body.lastName);
        const email = req.body.email.toLowerCase();
        const password = req.body.password;
        const username = req.sanitize(req.body.username);

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return errorResponse(res, 400, 'Invalid email format');
        }

        // Validate password strength
        if (password.length < 8) {
            return errorResponse(res, 400, 'Password must be at least 8 characters long');
        }

        // Validate username format (alphanumeric and underscores only)
        const usernameRegex = /^[a-zA-Z0-9_]+$/;
        if (!usernameRegex.test(username)) {
            return errorResponse(res, 400, 'Username can only contain letters, numbers, and underscores');
        }

        const user = new User({
            firstName,
            lastName,
            email,
            password,
            username,
        });

        let savedUser;
        try {
            savedUser = await user.save();
        } catch (error) {
            if (error.message.includes('already exists')) {
                return errorResponse(res, 409, 'An account with this email already exists');
            }
            throw error; // Re-throw other errors to be caught by the outer try-catch
        }

        const access = await user.generateAccessToken();
        const refresh = await user.generateRefreshToken();

        // Create a workspace for the user
        const workspacePayload = {
            title: `${firstName}'s Workspace`,
            description: `This is ${firstName}'s workspace`,
            slug: `${firstName.toLowerCase()}workspace`,
            userId: savedUser.id,
        };

        const workspace = await createWorkspace(workspacePayload, 'new-user');
        savedUser.workspaceId = workspace.id;

        // Send welcome email
        await sendWelcomeNotification(savedUser);

        return successResponse(res, {
            user: savedUser,
            accessToken: {
                token: access,
                expires: new Date(Date.now() + TOKEN_EXPIRY.access),
            },
            refreshToken: {
                token: refresh,
                expires: new Date(Date.now() + TOKEN_EXPIRY.refresh),
            },
        });
    } catch (error) {
        console.error('Registration error:', error);
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map((err) => err.message);
            return errorResponse(res, 400, errors);
        }
        return errorResponse(res, 500, 'Registration failed');
    }
};

export const login = async (req, res) => {
    try {
        const {email, password} = req.body;

        // Input validation
        if (!email || !password) {
            return errorResponse(res, 400, 'Email and password are required');
        }

        const user = await User.findByCredentials(email.toLowerCase(), password);
        const access = await user.generateAccessToken();
        const refresh = await user.generateRefreshToken();

        return successResponse(res, {
            user,
            accessToken: {
                token: access,
                expires: new Date(Date.now() + TOKEN_EXPIRY.access),
            },
            refreshToken: {
                token: refresh,
                expires: new Date(Date.now() + TOKEN_EXPIRY.refresh),
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        return errorResponse(res, 401, 'Invalid email or password');
    }
};

export const logout = async (req, res) => {
    try {
        const user = req.user;
        user.token = '';
        await user.save();
        return successResponse(res, {message: 'Logged out successfully'});
    } catch (error) {
        console.error('Logout error:', error);
        return errorResponse(res, 500, 'Logout failed');
    }
};

export const refresh = async (req, res) => {
    try {
        const {token} = req.body;
        const header = req.header('Authorization');

        if (!token || !header) {
            return errorResponse(res, 401, 'Missing authentication tokens');
        }

        const accessToken = header.split(' ')[1];

        const expiredAccessToken = jwt.verify(
            accessToken,
            process.env.ACCESS_TOKEN_SECRET,
            {ignoreExpiration: true},
        );

        const expiredTokenHash = crypto
            .createHash('sha256')
            .update(accessToken)
            .digest('hex');

        const decodedRefreshToken = jwt.verify(
            token,
            process.env.REFRESH_TOKEN_SECRET,
        );

        if (expiredAccessToken.id !== decodedRefreshToken.id) {
            return errorResponse(res, 401, 'Token mismatch');
        }

        const user = await User.findByPk(decodedRefreshToken.id);

        if (!user) {
            return errorResponse(res, 401, 'User not found');
        }

        if (user.token !== expiredTokenHash) {
            return errorResponse(res, 401, 'Invalid token');
        }

        const access = await user.generateAccessToken();
        const refresh = await user.generateRefreshToken();

        return successResponse(res, {
            accessToken: {
                token: access,
                expires: new Date(Date.now() + TOKEN_EXPIRY.access),
            },
            refreshToken: {
                token: refresh,
                expires: new Date(Date.now() + TOKEN_EXPIRY.refresh),
            },
        });
    } catch (error) {
        console.error('Token refresh error:', error);
        return errorResponse(res, 401, 'Token refresh failed');
    }
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
            return errorResponse(res, 400, 'Username, first name, and last name are required');
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
                return errorResponse(res, 400, 'Password must be at least 8 characters long');
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

        return successResponse(res, {message: 'Profile picture updated successfully'});
    } catch (error) {
        console.error('Update profile picture error:', error);
        return errorResponse(res, 500, 'Failed to update profile picture');
    }
};

