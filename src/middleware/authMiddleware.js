/* eslint-disable require-jsdoc */

import jwt from 'jsonwebtoken';
import 'dotenv/config';
import User from '../models/User.js';
import config from '../config/config.js';

/**
 * Middleware to authenticate requests using JWT access tokens.
 *
 * Verifies the Authorization header (Bearer token), decodes the token,
 * finds the associated user, and attaches the user object to `req.user`.
 *
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function.
 * @return {void}
 */
async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            message: 'Authorization header missing or invalid format',
            success: false,
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decodedToken = jwt.verify(token, config.jwt.secret, {algorithms: ['HS512']});

        const user = await User.findByPk(decodedToken.id);

        if (!user) {
            return res.status(401).json({
                message: 'Invalid access token: User not found',
                success: false,
            });
        }

        req.user = user;
        next();
    } catch (err) {
        let errorMessage = 'Invalid access token';
        let statusCode = 401;

        if (err instanceof jwt.TokenExpiredError) {
            errorMessage = 'Access token has expired';
        } else if (err instanceof jwt.JsonWebTokenError) {
            errorMessage = `Invalid token: ${err.message}`;
        } else {
            console.error('Auth Middleware Error:', err);
            errorMessage = 'Authentication failed due to an internal error.';
            statusCode = 500;
        }

        return res.status(statusCode).json({
            message: errorMessage,
            success: false,
        });
    }
}

export default authMiddleware;
