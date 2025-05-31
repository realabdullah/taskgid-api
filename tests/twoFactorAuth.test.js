import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert';
import {
    generateTwoFactorSecret,
    generateQRCode,
    verifyTOTPToken,
    isBackupCode,
    formatBackupCode,
    generateBackupCodes,
    isValidBackupCodeFormat,
    getCurrentTOTPCode,
    getTOTPTimeRemaining,
    validateSetupData,
} from '../src/utils/twoFactorAuth.js';

describe('Two-Factor Authentication Utilities', () => {
    let testSecret;
    let testSecretData;

    beforeEach(() => {
        // Generate fresh test data for each test
        testSecretData = generateTwoFactorSecret('test@example.com', 'TaskGid Test');
        testSecret = testSecretData.secret;
    });

    describe('Secret Generation', () => {
        it('should generate valid secret data', () => {
            assert.ok(testSecretData, 'Secret data should be defined');
            assert.ok(testSecretData.secret, 'Secret should be defined');
            assert.ok(testSecretData.otpauthUrl, 'OTP auth URL should be defined');
            assert.strictEqual(typeof testSecretData.secret, 'string', 'Secret should be a string');
            assert.ok(testSecretData.secret.length > 0, 'Secret should not be empty');
        });

        it('should generate Base32 encoded secret', () => {
            // Base32 should only contain A-Z and 2-7
            assert.match(testSecret, /^[A-Z2-7]+$/, 'Secret should be valid Base32');
            assert.ok(testSecret.length >= 16, 'Secret should be at least 16 characters');
        });

        it('should include correct service name in otpauth URL', () => {
            assert.ok(testSecretData.otpauthUrl.includes('TaskGid%20Test'), 'Should contain service name');
            assert.ok(testSecretData.otpauthUrl.includes('test@example.com'), 'Should contain email');
            assert.ok(testSecretData.otpauthUrl.startsWith('otpauth://totp/'), 'Should be TOTP URL');
        });

        it('should validate setup data correctly', () => {
            assert.strictEqual(validateSetupData(testSecretData), true, 'Valid setup data should pass');
            assert.strictEqual(validateSetupData(null), false, 'Null should fail');
            assert.strictEqual(validateSetupData({}), false, 'Empty object should fail');
            assert.strictEqual(validateSetupData({secret: 'short'}), false, 'Short secret should fail');
        });
    });

    describe('QR Code Generation', () => {
        it('should generate valid QR code data URL', async () => {
            const qrCode = await generateQRCode(testSecretData.otpauthUrl);

            assert.ok(qrCode, 'QR code should be defined');
            assert.strictEqual(typeof qrCode, 'string', 'QR code should be a string');
            assert.match(qrCode, /^data:image\/png;base64,/, 'Should be a PNG data URL');
            assert.ok(qrCode.length > 1000, 'QR code should be substantial in size');
        });

        it('should throw error for invalid otpauth URL', async () => {
            try {
                await generateQRCode('invalid-url');
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.ok(error.message.includes('Failed to generate QR code'), 'Should throw appropriate error');
            }
        });
    });

    describe('TOTP Token Generation and Verification', () => {
        it('should generate valid TOTP code', () => {
            const code = getCurrentTOTPCode(testSecret);

            assert.ok(code, 'Code should be defined');
            assert.strictEqual(typeof code, 'string', 'Code should be a string');
            assert.match(code, /^\d{6}$/, 'Code should be 6 digits');
        });

        it('should verify current TOTP code', () => {
            const currentCode = getCurrentTOTPCode(testSecret);
            const isValid = verifyTOTPToken(currentCode, testSecret);

            assert.strictEqual(isValid, true, 'Current code should be valid');
        });

        it('should reject invalid TOTP codes', () => {
            assert.strictEqual(verifyTOTPToken('000000', testSecret), false, 'Should reject 000000');
            assert.strictEqual(verifyTOTPToken('123456', testSecret), false, 'Should reject 123456');
            assert.strictEqual(verifyTOTPToken('999999', testSecret), false, 'Should reject 999999');
        });

        it('should handle edge cases for TOTP verification', () => {
            assert.strictEqual(verifyTOTPToken('', testSecret), false, 'Empty token should fail');
            assert.strictEqual(verifyTOTPToken(null, testSecret), false, 'Null token should fail');
            assert.strictEqual(verifyTOTPToken('123', testSecret), false, 'Short token should fail');
            assert.strictEqual(verifyTOTPToken('1234567', testSecret), false, 'Long token should fail');
            assert.strictEqual(verifyTOTPToken('12345a', testSecret), false, 'Non-numeric should fail');
            assert.strictEqual(verifyTOTPToken('123456', ''), false, 'Empty secret should fail');
            assert.strictEqual(verifyTOTPToken('123456', null), false, 'Null secret should fail');
        });

        it('should handle tokens with spaces and dashes', () => {
            const currentCode = getCurrentTOTPCode(testSecret);
            const codeWithSpaces = `${currentCode.slice(0, 3)} ${currentCode.slice(3)}`;
            const codeWithDashes = `${currentCode.slice(0, 3)}-${currentCode.slice(3)}`;

            assert.strictEqual(verifyTOTPToken(codeWithSpaces, testSecret), true, 'Should handle spaces');
            assert.strictEqual(verifyTOTPToken(codeWithDashes, testSecret), true, 'Should handle dashes');
        });

        it('should get time remaining until next code', () => {
            const timeRemaining = getTOTPTimeRemaining();

            assert.ok(timeRemaining !== undefined, 'Time remaining should be defined');
            assert.strictEqual(typeof timeRemaining, 'number', 'Should be a number');
            assert.ok(timeRemaining > 0, 'Should be positive');
            assert.ok(timeRemaining <= 30, 'Should not exceed 30 seconds');
        });
    });

    describe('Backup Code Management', () => {
        it('should generate valid backup codes', () => {
            const codes = generateBackupCodes(8);

            assert.ok(codes, 'Codes should be defined');
            assert.ok(Array.isArray(codes), 'Should be an array');
            assert.strictEqual(codes.length, 8, 'Should generate 8 codes');

            codes.forEach((code) => {
                assert.strictEqual(typeof code, 'string', 'Each code should be a string');
                assert.match(code, /^[A-F0-9]{4}-[A-F0-9]{4}$/, 'Should match expected format');
            });
        });

        it('should generate unique backup codes', () => {
            const codes = generateBackupCodes(8);
            const uniqueCodes = new Set(codes);

            assert.strictEqual(uniqueCodes.size, codes.length, 'All codes should be unique');
        });

        it('should validate backup code format correctly', () => {
            assert.strictEqual(isValidBackupCodeFormat('ABCD-1234'), true, 'Valid format should pass');
            assert.strictEqual(isValidBackupCodeFormat('1234-ABCD'), true, 'Valid format should pass');
            assert.strictEqual(isValidBackupCodeFormat('FFFF-0000'), true, 'Valid format should pass');

            // Invalid formats
            assert.strictEqual(isValidBackupCodeFormat('1234'), false, 'Short format should fail');
            assert.strictEqual(isValidBackupCodeFormat('ABCD-123'), false, 'Incomplete format should fail');
            assert.strictEqual(isValidBackupCodeFormat('ABCD-12345'), false, 'Long format should fail');
            assert.strictEqual(isValidBackupCodeFormat('ABCD_1234'), false, 'Wrong separator should fail');
            assert.strictEqual(isValidBackupCodeFormat('GHIJ-1234'), false, 'Invalid hex should fail');
            assert.strictEqual(isValidBackupCodeFormat(''), false, 'Empty should fail');
            assert.strictEqual(isValidBackupCodeFormat(null), false, 'Null should fail');
            assert.strictEqual(isValidBackupCodeFormat(undefined), false, 'Undefined should fail');
        });

        it('should identify backup codes correctly', () => {
            assert.strictEqual(isBackupCode('ABCD-1234'), true, 'Valid backup code should be identified');
            assert.strictEqual(isBackupCode('ABCD1234'), true, 'Backup code without dash should work');
            assert.strictEqual(isBackupCode('abcd-1234'), true, 'Lowercase should work');

            assert.strictEqual(isBackupCode('123456'), false, 'TOTP format should not be backup code');
            assert.strictEqual(isBackupCode('ABCD-123'), false, 'Invalid format should not be backup code');
            assert.strictEqual(isBackupCode(''), false, 'Empty should not be backup code');
            assert.strictEqual(isBackupCode(null), false, 'Null should not be backup code');
        });

        it('should format backup codes correctly', () => {
            assert.strictEqual(formatBackupCode('abcd-1234'), 'ABCD-1234', 'Should uppercase');
            assert.strictEqual(formatBackupCode('  ABCD-1234  '), 'ABCD-1234', 'Should trim spaces');
            assert.strictEqual(formatBackupCode('abcd 1234'), 'ABCD1234', 'Should handle space separator');
            assert.strictEqual(formatBackupCode(''), '', 'Empty should return empty');
            assert.strictEqual(formatBackupCode(null), '', 'Null should return empty');
        });

        it('should generate custom number of backup codes', () => {
            assert.strictEqual(generateBackupCodes(5).length, 5, 'Should generate 5 codes');
            assert.strictEqual(generateBackupCodes(10).length, 10, 'Should generate 10 codes');
            assert.strictEqual(generateBackupCodes(1).length, 1, 'Should generate 1 code');
            assert.strictEqual(generateBackupCodes().length, 8, 'Default should be 8 codes');
        });
    });

    describe('Security and Edge Cases', () => {
        it('should handle malformed inputs gracefully', () => {
            // These should not throw errors, just return false/empty
            assert.doesNotThrow(() => verifyTOTPToken(undefined, testSecret), 'Should handle undefined token');
            assert.doesNotThrow(() => isBackupCode(undefined), 'Should handle undefined backup code check');
            assert.doesNotThrow(() => formatBackupCode(undefined), 'Should handle undefined format');
            assert.doesNotThrow(() => isValidBackupCodeFormat({}), 'Should handle object input');
        });

        it('should not accept TOTP codes for different secrets', () => {
            const secret1 = generateTwoFactorSecret('user1@example.com').secret;
            const secret2 = generateTwoFactorSecret('user2@example.com').secret;

            const code1 = getCurrentTOTPCode(secret1);

            assert.strictEqual(verifyTOTPToken(code1, secret1), true, 'Code should work with correct secret');
            assert.strictEqual(verifyTOTPToken(code1, secret2), false, 'Code should not work with wrong secret');
        });

        it('should generate different secrets for different users', () => {
            const secret1 = generateTwoFactorSecret('user1@example.com');
            const secret2 = generateTwoFactorSecret('user2@example.com');

            assert.notStrictEqual(secret1.secret, secret2.secret, 'Secrets should be different');
            assert.notStrictEqual(secret1.otpauthUrl, secret2.otpauthUrl, 'URLs should be different');
        });
    });
});

describe('TwoFactorAuth Model Methods (Mock)', () => {
    let mockTwoFactorAuth;

    beforeEach(() => {
        mockTwoFactorAuth = {
            backupCodes: ['ABCD-1234', 'EFGH-5678', 'IJKL-9012', 'MNOP-3456'],
            recoveryCodesUsed: 0,

            useBackupCode(code) {
                const codes = this.backupCodes || [];
                const index = codes.indexOf(code.toUpperCase());

                if (index === -1) {
                    return false;
                }

                codes.splice(index, 1);
                this.backupCodes = codes;
                this.recoveryCodesUsed += 1;

                return true;
            },

            isBackupCodesLow() {
                const codes = this.backupCodes || [];
                return codes.length < 3;
            },

            regenerateBackupCodes() {
                this.backupCodes = generateBackupCodes(8);
                this.recoveryCodesUsed = 0;
                return this.backupCodes;
            },
        };
    });

    it('should use valid backup codes successfully', () => {
        const result = mockTwoFactorAuth.useBackupCode('ABCD-1234');

        assert.strictEqual(result, true, 'Should successfully use valid code');
        assert.ok(!mockTwoFactorAuth.backupCodes.includes('ABCD-1234'), 'Used code should be removed');
        assert.strictEqual(mockTwoFactorAuth.backupCodes.length, 3, 'Should have 3 codes remaining');
        assert.strictEqual(mockTwoFactorAuth.recoveryCodesUsed, 1, 'Should increment used count');
    });

    it('should reject invalid backup codes', () => {
        const result = mockTwoFactorAuth.useBackupCode('XXXX-YYYY');

        assert.strictEqual(result, false, 'Should reject invalid code');
        assert.strictEqual(mockTwoFactorAuth.backupCodes.length, 4, 'Should still have all codes');
        assert.strictEqual(mockTwoFactorAuth.recoveryCodesUsed, 0, 'Should not increment used count');
    });

    it('should detect when backup codes are running low', () => {
        assert.strictEqual(mockTwoFactorAuth.isBackupCodesLow(), false, 'Should not be low initially');

        // Use codes until low
        mockTwoFactorAuth.useBackupCode('ABCD-1234');
        mockTwoFactorAuth.useBackupCode('EFGH-5678');

        assert.strictEqual(mockTwoFactorAuth.isBackupCodesLow(), true, 'Should be low after using codes');
    });

    it('should regenerate backup codes correctly', () => {
        const originalCodes = [...mockTwoFactorAuth.backupCodes];
        mockTwoFactorAuth.useBackupCode('ABCD-1234'); // Use one code

        const newCodes = mockTwoFactorAuth.regenerateBackupCodes();

        assert.strictEqual(newCodes.length, 8, 'Should generate 8 new codes');
        assert.strictEqual(mockTwoFactorAuth.backupCodes.length, 8, 'Should have 8 codes');
        assert.strictEqual(mockTwoFactorAuth.recoveryCodesUsed, 0, 'Should reset used count');

        // New codes should be different from original
        const hasCommonCodes = newCodes.some((code) => originalCodes.includes(code));
        assert.strictEqual(hasCommonCodes, false, 'New codes should be different from original');
    });

    it('should handle case-insensitive backup code usage', () => {
        assert.strictEqual(mockTwoFactorAuth.useBackupCode('abcd-1234'), true, 'Should handle lowercase');
        assert.strictEqual(mockTwoFactorAuth.useBackupCode('efgh-5678'), true, 'Should handle lowercase');
    });

    it('should not allow reuse of backup codes', () => {
        assert.strictEqual(mockTwoFactorAuth.useBackupCode('ABCD-1234'), true, 'First use should succeed');
        assert.strictEqual(mockTwoFactorAuth.useBackupCode('ABCD-1234'), false, 'Reuse should fail');
    });
});
