import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {promisify} from 'util';
import config from '../config/config.js';

const randomBytes = promisify(crypto.randomBytes);

/**
 * Authentication utility class for handling JWT tokens and refresh tokens
 */
class Auth {
    /**
     * Generate a new access token
     * @param {Object} user - The user object
     * @return {string} The generated access token
     */
    static generateAccessToken(user) {
        const payload = {
            id: user.id,
            email: user.email,
            role: user.role,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
        };

        return jwt.sign(payload, config.jwt.secret, {
            algorithm: 'HS512',
        });
    }

    /**
     * Generate a new refresh token
     * @return {Promise<string>} The generated refresh token
     */
    static async generateRefreshToken() {
        const buffer = await randomBytes(40); // 320 bits of entropy
        return buffer.toString('base64url');
    }

    /**
     * Verify an access token
     * @param {string} token - The access token to verify
     * @return {Object} The decoded token payload
     */
    static verifyAccessToken(token) {
        try {
            return jwt.verify(token, config.jwt.secret, {
                algorithms: ['HS512'],
            });
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new Error('Token has expired');
            }
            throw new Error('Invalid token');
        }
    }

    /**
     * Generate token pair (access token and refresh token)
     * @param {Object} user - The user object
     * @return {Promise<Object>} Object containing access token and refresh token
     */
    static async generateTokenPair(user) {
        const [accessToken, refreshToken] = await Promise.all([
            this.generateAccessToken(user),
            this.generateRefreshToken(),
        ]);

        return {
            accessToken,
            refreshToken,
            expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
        };
    }

    /**
     * Set secure cookie options
     * @return {Object} Cookie options
     */
    static getSecureCookieOptions() {
        return {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
            domain: process.env.COOKIE_DOMAIN || undefined,
        };
    }

    /**
     * Set refresh token cookie options
     * @return {Object} Cookie options
     */
    static getRefreshTokenCookieOptions() {
        return {
            ...this.getSecureCookieOptions(),
            maxAge: config.jwt.refreshTokenExpiry * 1000, // Convert to milliseconds
        };
    }
}

export default Auth;
