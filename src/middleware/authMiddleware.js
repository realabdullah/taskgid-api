/* eslint-disable require-jsdoc */

import jwt from 'jsonwebtoken';
import 'dotenv/config';
import User from '../models/User.js';
import ApiKey, {API_KEY_PREFIX} from '../models/ApiKey.js';
import config from '../config/config.js';

/**
 * Authenticates a request presenting an API key rather than a session JWT.
 *
 * Resolves to the issuing user, exactly as the JWT path does, so every
 * existing route's role checks run unchanged — the only addition is
 * `req.apiKeyWorkspaceId`, which `workspaceMiddleware.js` uses to keep the
 * key confined to the one workspace it was issued for.
 * @param {string} rawKey - The presented key.
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function.
 * @return {Promise<void>} Resolves once authenticated or an error response is sent.
 */
async function authenticateApiKey(rawKey, req, res, next) {
    try {
        const apiKey = await ApiKey.findActiveByRawKey(rawKey);
        if (!apiKey) {
            return res.status(401).json({message: 'Invalid API key', success: false});
        }

        const user = await User.findByPk(apiKey.userId);
        if (!user) {
            return res.status(401).json({message: 'Invalid API key: user not found', success: false});
        }

        req.user = user;
        req.apiKeyWorkspaceId = apiKey.workspaceId;
        req.apiKey = apiKey;
        // Telemetry only — never block the request on it.
        apiKey.update({lastUsedAt: new Date()}).catch((err) => {
            console.error('Failed to record API key use:', err.message);
        });

        next();
    } catch (err) {
        console.error('API Key Auth Error:', err);
        return res.status(500).json({message: 'Authentication failed due to an internal error.', success: false});
    }
}

/**
 * Middleware to authenticate requests using JWT access tokens or API keys.
 *
 * Verifies the Authorization header (Bearer token). A key carrying the API
 * key prefix is authenticated as one; anything else is verified as a JWT,
 * decoded, and resolved to its user, attached at `req.user`.
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

    if (token.startsWith(API_KEY_PREFIX)) {
        return authenticateApiKey(token, req, res, next);
    }

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
