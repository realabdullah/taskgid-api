import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';

/**
 * Generate a new 2FA secret for a user
 * @param {string} userEmail - User's email
 * @param {string} serviceName - Service name (e.g., "TaskGid")
 * @return {Object} Secret and other setup data
 */
export const generateTwoFactorSecret = (userEmail, serviceName = 'TaskGid') => {
    const secret = speakeasy.generateSecret({
        name: `${serviceName} (${userEmail})`,
        issuer: serviceName,
        length: 32,
    });

    return {
        secret: secret.base32,
        otpauthUrl: secret.otpauth_url,
        qrCodeUrl: null, // Will be generated separately
    };
};

/**
 * Generate QR code data URL for 2FA setup
 * @param {string} otpauthUrl - The otpauth URL from generateTwoFactorSecret
 * @return {Promise<string>} QR code data URL
 */
export const generateQRCode = async (otpauthUrl) => {
    try {
        const qrCodeDataURL = await QRCode.toDataURL(otpauthUrl, {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            quality: 0.92,
            margin: 1,
            color: {
                dark: '#000000',
                light: '#FFFFFF',
            },
            width: 256,
        });
        return qrCodeDataURL;
    } catch (error) {
        throw new Error('Failed to generate QR code');
    }
};

/**
 * Verify a TOTP token against a secret
 * @param {string} token - 6-digit TOTP token
 * @param {string} secret - Base32 secret
 * @param {number} window - Time window for verification (default: 2)
 * @return {boolean} Whether the token is valid
 */
export const verifyTOTPToken = (token, secret, window = 2) => {
    if (!token || !secret) {
        return false;
    }

    // Remove any spaces or dashes from token
    const cleanToken = token.replace(/[\s-]/g, '');

    // Verify token format (should be 6 digits)
    if (!/^\d{6}$/.test(cleanToken)) {
        return false;
    }

    return speakeasy.totp.verify({
        secret: secret,
        encoding: 'base32',
        token: cleanToken,
        window: window,
    });
};

/**
 * Generate a backup code in the format XXXX-XXXX
 * @return {string} Formatted backup code
 */
export const generateBackupCode = () => {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `${code.slice(0, 4)}-${code.slice(4, 8)}`;
};

/**
 * Generate multiple backup codes
 * @param {number} count - Number of codes to generate (default: 8)
 * @return {Array<string>} Array of backup codes
 */
export const generateBackupCodes = (count = 8) => {
    const codes = [];
    for (let i = 0; i < count; i++) {
        codes.push(generateBackupCode());
    }
    return codes;
};

/**
 * Validate backup code format
 * @param {string} code - Backup code to validate
 * @return {boolean} Whether the format is valid
 */
export const isValidBackupCodeFormat = (code) => {
    if (!code || typeof code !== 'string') {
        return false;
    }

    // Remove spaces and convert to uppercase
    const cleanCode = code.trim().toUpperCase();

    // Check format: XXXX-XXXX (8 hex chars with dash)
    return /^[A-F0-9]{4}-[A-F0-9]{4}$/.test(cleanCode);
};

/**
 * Clean and format backup code
 * @param {string} code - Raw backup code
 * @return {string} Cleaned and formatted backup code
 */
export const formatBackupCode = (code) => {
    if (!code) return '';
    return code.trim().toUpperCase().replace(/\s+/g, '');
};

/**
 * Check if a token looks like a backup code vs TOTP
 * @param {string} token - Token to check
 * @return {boolean} True if it looks like a backup code
 */
export const isBackupCode = (token) => {
    if (!token) return false;
    const cleanToken = token.trim().toUpperCase();
    return /^[A-F0-9]{4}-?[A-F0-9]{4}$/.test(cleanToken);
};

/**
 * Sanitize secret for display (show only first/last chars)
 * @param {string} secret - Secret to sanitize
 * @return {string} Sanitized secret
 */
export const sanitizeSecret = (secret) => {
    if (!secret || secret.length < 8) {
        return '****';
    }
    return `${secret.slice(0, 4)}${'*'.repeat(secret.length - 8)}${secret.slice(-4)}`;
};

/**
 * Get current TOTP code for a secret (for testing/debugging)
 * @param {string} secret - Base32 secret
 * @return {string} Current TOTP code
 */
export const getCurrentTOTPCode = (secret) => {
    return speakeasy.totp({
        secret: secret,
        encoding: 'base32',
    });
};

/**
 * Get time remaining until next TOTP code
 * @return {number} Seconds remaining until next code
 */
export const getTOTPTimeRemaining = () => {
    const now = Math.floor(Date.now() / 1000);
    const period = 30; // TOTP period in seconds
    return period - (now % period);
};

/**
 * Validate 2FA setup data
 * @param {Object} setupData - Setup data from generateTwoFactorSecret
 * @return {boolean} Whether setup data is valid
 */
export const validateSetupData = (setupData) => {
    return !!(
        setupData &&
        setupData.secret &&
        setupData.otpauthUrl &&
        typeof setupData.secret === 'string' &&
        setupData.secret.length >= 16
    );
};
