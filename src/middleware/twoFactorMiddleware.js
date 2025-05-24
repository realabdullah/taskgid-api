import TwoFactorAuth from '../models/TwoFactorAuth.js';
import {errorResponse} from '../utils/responseUtils.js';
import {verifyTOTPToken, isBackupCode, formatBackupCode} from '../utils/twoFactorAuth.js';

/**
 * Middleware to require 2FA verification for sensitive operations
 * This middleware should be used AFTER authMiddleware
 * @param {Object} req - Express request object
 * @param {Object} req.user - Authenticated user (from authMiddleware)
 * @param {Object} req.body - Request body
 * @param {string} [req.body.twoFactorToken] - 2FA token for verification
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 * @return {void}
 */
export const requireTwoFactor = async (req, res, next) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return errorResponse(res, 401, 'Authentication required');
        }

        // Check if user has 2FA enabled
        const twoFactorAuth = await TwoFactorAuth.findOne({
            where: {userId},
            attributes: ['isEnabled', 'secret', 'backupCodes', 'lastUsedAt'],
        });

        // If 2FA is not enabled, allow the request to proceed
        if (!twoFactorAuth || !twoFactorAuth.isEnabled) {
            return next();
        }

        // 2FA is enabled, require verification
        const {twoFactorToken} = req.body;

        if (!twoFactorToken) {
            return errorResponse(res, 428, 'Two-factor authentication is required for this action', {
                requiresTwoFactor: true,
                message: 'Please provide your 6-digit authenticator code or backup code to continue',
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

                // Add backup code usage info to request for logging
                req.twoFactorInfo = {
                    tokenType: 'backup_code',
                    backupCodesRemaining: twoFactorAuth.backupCodes.length,
                    isBackupCodesLow: twoFactorAuth.isBackupCodesLow(),
                };
            }
        } else {
            // Handle TOTP token
            isValidAuth = verifyTOTPToken(twoFactorToken, twoFactorAuth.secret);
            tokenType = 'totp';

            if (isValidAuth) {
                req.twoFactorInfo = {
                    tokenType: 'totp',
                };
            }
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

        // Add 2FA verification info to request for use in controllers
        req.twoFactorVerified = true;

        next();
    } catch (error) {
        console.error('Two-factor middleware error:', error);
        return errorResponse(res, 500, 'Two-factor authentication verification failed');
    }
};

/**
 * Middleware to check if 2FA is enabled for a user (doesn't require verification)
 * Adds twoFactorEnabled boolean to req.user
 * @param {Object} req - Express request object
 * @param {Object} req.user - Authenticated user
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 * @return {void}
 */
export const checkTwoFactorStatus = async (req, res, next) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            req.user = req.user || {};
            req.user.twoFactorEnabled = false;
            return next();
        }

        const twoFactorAuth = await TwoFactorAuth.findOne({
            where: {userId},
            attributes: ['isEnabled'],
        });

        req.user.twoFactorEnabled = !!(twoFactorAuth && twoFactorAuth.isEnabled);

        next();
    } catch (error) {
        console.error('Two-factor status check error:', error);
        req.user = req.user || {};
        req.user.twoFactorEnabled = false;
        next();
    }
};

/**
 * Middleware variant that only requires 2FA for certain HTTP methods
 * @param {Array<string>} methods - HTTP methods that require 2FA (e.g., ['POST', 'PUT', 'DELETE'])
 * @return {Function} Middleware function
 */
export const requireTwoFactorForMethods = (methods = ['POST', 'PUT', 'DELETE']) => {
    return async (req, res, next) => {
        if (!methods.includes(req.method.toUpperCase())) {
            return next();
        }

        return requireTwoFactor(req, res, next);
    };
};

/**
 * Middleware that requires 2FA only for admin users
 * @param {Object} req - Express request object
 * @param {Object} req.user - Authenticated user
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 * @return {void}
 */
export const requireTwoFactorForAdmins = async (req, res, next) => {
    try {
        const user = req.user;

        if (!user) {
            return errorResponse(res, 401, 'Authentication required');
        }

        // Check if user is admin (you may need to adjust this based on your admin logic)
        const isAdmin = user.role === 'admin' || user.isAdmin;

        if (!isAdmin) {
            return next();
        }

        // User is admin, require 2FA
        return requireTwoFactor(req, res, next);
    } catch (error) {
        console.error('Admin 2FA middleware error:', error);
        return errorResponse(res, 500, 'Authentication verification failed');
    }
};

export default requireTwoFactor;
