import express from 'express';
import {
    getTwoFactorStatus,
    generateTwoFactorSetup,
    verifyAndEnableTwoFactor,
    disableTwoFactor,
    regenerateBackupCodes,
    verifyTwoFactorToken,
    getBackupCodesInfo,
} from '../controllers/twoFactorAuthController.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authMiddleware);

/**
 * @route GET /api/auth/2fa/status
 * @description Get 2FA status for the authenticated user
 * @access Private
 */
router.get('/status', getTwoFactorStatus);

/**
 * @route POST /api/auth/2fa/setup
 * @description Generate 2FA setup data (QR code, secret)
 * @access Private
 */
router.post('/setup', generateTwoFactorSetup);

/**
 * @route POST /api/auth/2fa/enable
 * @description Verify and enable 2FA
 * @body {string} token - 6-digit TOTP code
 * @access Private
 */
router.post('/enable', verifyAndEnableTwoFactor);

/**
 * @route POST /api/auth/2fa/disable
 * @description Disable 2FA
 * @body {string} password - Current password
 * @body {string} token - 2FA token or backup code
 * @access Private
 */
router.post('/disable', disableTwoFactor);

/**
 * @route POST /api/auth/2fa/verify
 * @description Verify a 2FA token (for testing/validation)
 * @body {string} token - 2FA token to verify
 * @access Private
 */
router.post('/verify', verifyTwoFactorToken);

/**
 * @route GET /api/auth/2fa/backup-codes
 * @description Get backup codes information
 * @access Private
 */
router.get('/backup-codes', getBackupCodesInfo);

/**
 * @route POST /api/auth/2fa/backup-codes/regenerate
 * @description Regenerate backup codes
 * @body {string} token - 2FA token for verification
 * @access Private
 */
router.post('/backup-codes/regenerate', regenerateBackupCodes);

export default router;
