import TwoFactorAuth from '../models/TwoFactorAuth.js';
import User from '../models/User.js';
import {errorResponse, successResponse} from '../utils/responseUtils.js';
import {
    generateTwoFactorSecret,
    generateQRCode,
    verifyTOTPToken,
    isBackupCode,
    formatBackupCode,
    getTOTPTimeRemaining,
} from '../utils/twoFactorAuth.js';

/**
 * Get 2FA status and configuration for the authenticated user
 * @param {Object} req - Express request object
 * @param {Object} req.user - Authenticated user
 * @param {Object} res - Express response object
 * @return {Object} Response with 2FA status or error
 */
export const getTwoFactorStatus = async (req, res) => {
    try {
        const userId = req.user.id;

        const twoFactorAuth = await TwoFactorAuth.findOne({
            where: {userId},
            attributes: ['isEnabled', 'lastUsedAt', 'recoveryCodesUsed', 'backupCodes', 'createdAt'],
        });

        if (!twoFactorAuth) {
            return successResponse(res, {
                isEnabled: false,
                hasSecret: false,
                backupCodesCount: 0,
                lastUsedAt: null,
                recoveryCodesUsed: 0,
            });
        }

        const backupCodes = twoFactorAuth.backupCodes || [];

        return successResponse(res, {
            isEnabled: twoFactorAuth.isEnabled,
            hasSecret: true,
            backupCodesCount: backupCodes.length,
            isBackupCodesLow: twoFactorAuth.isBackupCodesLow(),
            lastUsedAt: twoFactorAuth.lastUsedAt,
            recoveryCodesUsed: twoFactorAuth.recoveryCodesUsed,
            enabledAt: twoFactorAuth.isEnabled ? twoFactorAuth.createdAt : null,
        });
    } catch (error) {
        console.error('Get 2FA Status Error:', error);
        return errorResponse(res, 500, 'Failed to retrieve 2FA status');
    }
};

/**
 * Generate 2FA setup data (secret, QR code) for the authenticated user
 * @param {Object} req - Express request object
 * @param {Object} req.user - Authenticated user
 * @param {Object} res - Express response object
 * @return {Object} Response with setup data or error
 */
export const generateTwoFactorSetup = async (req, res) => {
    try {
        const userId = req.user.id;
        const userEmail = req.user.email;

        // Check if user already has 2FA enabled
        const existingTwoFA = await TwoFactorAuth.findOne({where: {userId}});
        if (existingTwoFA && existingTwoFA.isEnabled) {
            return errorResponse(res, 400, '2FA is already enabled for this account');
        }

        // Generate new secret
        const secretData = generateTwoFactorSecret(userEmail);
        const qrCodeDataURL = await generateQRCode(secretData.otpauthUrl);

        // Store the secret (but don't enable yet)
        if (existingTwoFA) {
            await existingTwoFA.update({
                secret: secretData.secret,
                isEnabled: false,
            });
        } else {
            await TwoFactorAuth.create({
                userId,
                secret: secretData.secret,
                isEnabled: false,
            });
        }

        return successResponse(res, {
            secret: secretData.secret,
            qrCode: qrCodeDataURL,
            manualEntryKey: secretData.secret,
            issuer: 'TaskGid',
            accountName: userEmail,
            message: 'Scan the QR code with your authenticator app, then verify with a code to complete setup',
        });
    } catch (error) {
        console.error('Generate 2FA Setup Error:', error);
        return errorResponse(res, 500, 'Failed to generate 2FA setup');
    }
};

/**
 * Verify 2FA setup and enable 2FA for the user
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.token - 6-digit TOTP code
 * @param {Object} req.user - Authenticated user
 * @param {Object} res - Express response object
 * @return {Object} Response with backup codes or error
 */
export const verifyAndEnableTwoFactor = async (req, res) => {
    try {
        const userId = req.user.id;
        const {token} = req.body;

        if (!token) {
            return errorResponse(res, 400, 'Verification code is required');
        }

        const twoFactorAuth = await TwoFactorAuth.findOne({where: {userId}});
        if (!twoFactorAuth) {
            return errorResponse(res, 404, '2FA setup not found. Please generate setup first.');
        }

        if (twoFactorAuth.isEnabled) {
            return errorResponse(res, 400, '2FA is already enabled for this account');
        }

        // Verify the token
        const isValidToken = verifyTOTPToken(token, twoFactorAuth.secret);
        if (!isValidToken) {
            return errorResponse(res, 400, 'Invalid verification code. Please try again.');
        }

        // Enable 2FA and regenerate backup codes
        await twoFactorAuth.update({
            isEnabled: true,
            lastUsedAt: new Date(),
        });

        // Generate fresh backup codes
        const backupCodes = twoFactorAuth.regenerateBackupCodes();
        await twoFactorAuth.save();

        return successResponse(res, {
            message: '2FA has been successfully enabled for your account',
            backupCodes: backupCodes,
            warning:
            `Please save these backup codes in a safe place. 
            They can be used to access your account if you lose your authenticator device.`,
        });
    } catch (error) {
        console.error('Verify and Enable 2FA Error:', error);
        return errorResponse(res, 500, 'Failed to enable 2FA');
    }
};

/**
 * Disable 2FA for the authenticated user
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.password - User's current password for verification
 * @param {string} [req.body.token] - 2FA token or backup code
 * @param {Object} req.user - Authenticated user
 * @param {Object} res - Express response object
 * @return {Object} Response with success message or error
 */
export const disableTwoFactor = async (req, res) => {
    try {
        const userId = req.user.id;
        const {password, token} = req.body;

        if (!password) {
            return errorResponse(res, 400, 'Current password is required to disable 2FA');
        }

        // Verify current password
        const user = await User.findByPk(userId);
        const isValidPassword = await user.comparePassword(password);
        if (!isValidPassword) {
            return errorResponse(res, 401, 'Invalid password');
        }

        const twoFactorAuth = await TwoFactorAuth.findOne({where: {userId}});
        if (!twoFactorAuth || !twoFactorAuth.isEnabled) {
            return errorResponse(res, 400, '2FA is not enabled for this account');
        }

        // If 2FA is enabled, require a valid token or backup code
        if (token) {
            let isValidAuth = false;

            if (isBackupCode(token)) {
                // Use backup code
                const formattedCode = formatBackupCode(token);
                isValidAuth = twoFactorAuth.useBackupCode(formattedCode);
                if (isValidAuth) {
                    await twoFactorAuth.save();
                }
            } else {
                // Use TOTP token
                isValidAuth = verifyTOTPToken(token, twoFactorAuth.secret);
            }

            if (!isValidAuth) {
                return errorResponse(res, 400, 'Invalid 2FA code');
            }
        } else {
            return errorResponse(res, 400, '2FA code is required to disable 2FA');
        }

        // Delete 2FA configuration
        await twoFactorAuth.destroy();

        return successResponse(res, {
            message: '2FA has been successfully disabled for your account',
        });
    } catch (error) {
        console.error('Disable 2FA Error:', error);
        return errorResponse(res, 500, 'Failed to disable 2FA');
    }
};

/**
 * Regenerate backup codes for 2FA
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.token - 2FA token for verification
 * @param {Object} req.user - Authenticated user
 * @param {Object} res - Express response object
 * @return {Object} Response with new backup codes or error
 */
export const regenerateBackupCodes = async (req, res) => {
    try {
        const userId = req.user.id;
        const {token} = req.body;

        if (!token) {
            return errorResponse(res, 400, '2FA code is required');
        }

        const twoFactorAuth = await TwoFactorAuth.findOne({where: {userId}});
        if (!twoFactorAuth || !twoFactorAuth.isEnabled) {
            return errorResponse(res, 400, '2FA is not enabled for this account');
        }

        // Verify the token
        let isValidAuth = false;

        if (isBackupCode(token)) {
            // Use existing backup code
            const formattedCode = formatBackupCode(token);
            isValidAuth = twoFactorAuth.useBackupCode(formattedCode);
        } else {
            // Use TOTP token
            isValidAuth = verifyTOTPToken(token, twoFactorAuth.secret);
        }

        if (!isValidAuth) {
            return errorResponse(res, 400, 'Invalid 2FA code');
        }

        // Generate new backup codes
        const newBackupCodes = twoFactorAuth.regenerateBackupCodes();
        await twoFactorAuth.save();

        return successResponse(res, {
            backupCodes: newBackupCodes,
            message: 'New backup codes have been generated. Please save them in a safe place.',
            warning: 'Your old backup codes are no longer valid.',
        });
    } catch (error) {
        console.error('Regenerate Backup Codes Error:', error);
        return errorResponse(res, 500, 'Failed to regenerate backup codes');
    }
};

/**
 * Verify a 2FA token (for testing or validation)
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.token - 2FA token to verify
 * @param {Object} req.user - Authenticated user
 * @param {Object} res - Express response object
 * @return {Object} Response with verification result or error
 */
export const verifyTwoFactorToken = async (req, res) => {
    try {
        const userId = req.user.id;
        const {token} = req.body;

        if (!token) {
            return errorResponse(res, 400, 'Token is required');
        }

        const twoFactorAuth = await TwoFactorAuth.findOne({where: {userId}});
        if (!twoFactorAuth || !twoFactorAuth.isEnabled) {
            return errorResponse(res, 400, '2FA is not enabled for this account');
        }

        let isValid = false;
        let tokenType = 'unknown';

        if (isBackupCode(token)) {
            // Don't actually use the backup code for verification, just check format
            const formattedCode = formatBackupCode(token);
            const codes = twoFactorAuth.backupCodes || [];
            isValid = codes.includes(formattedCode);
            tokenType = 'backup_code';
        } else {
            // Verify TOTP token
            isValid = verifyTOTPToken(token, twoFactorAuth.secret);
            tokenType = 'totp';
        }

        return successResponse(res, {
            isValid,
            tokenType,
            timeRemaining: tokenType === 'totp' ? getTOTPTimeRemaining() : null,
        });
    } catch (error) {
        console.error('Verify 2FA Token Error:', error);
        return errorResponse(res, 500, 'Failed to verify token');
    }
};

/**
 * Get backup codes count and status
 * @param {Object} req - Express request object
 * @param {Object} req.user - Authenticated user
 * @param {Object} res - Express response object
 * @return {Object} Response with backup codes info or error
 */
export const getBackupCodesInfo = async (req, res) => {
    try {
        const userId = req.user.id;

        const twoFactorAuth = await TwoFactorAuth.findOne({
            where: {userId},
            attributes: ['backupCodes', 'recoveryCodesUsed', 'isEnabled'],
        });

        if (!twoFactorAuth || !twoFactorAuth.isEnabled) {
            return errorResponse(res, 400, '2FA is not enabled for this account');
        }

        const backupCodes = twoFactorAuth.backupCodes || [];

        return successResponse(res, {
            totalCodes: 8, // Original number
            remainingCodes: backupCodes.length,
            usedCodes: twoFactorAuth.recoveryCodesUsed,
            isLow: twoFactorAuth.isBackupCodesLow(),
            recommendation: twoFactorAuth.isBackupCodesLow() ?
                'Consider regenerating backup codes as you have less than 3 remaining.' : null,
        });
    } catch (error) {
        console.error('Get Backup Codes Info Error:', error);
        return errorResponse(res, 500, 'Failed to get backup codes information');
    }
};
