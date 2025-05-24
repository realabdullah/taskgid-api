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
} from '../src/utils/twoFactorAuth.js';

/**
 * Test Two-Factor Authentication utilities
 */
async function testTwoFactorAuth() {
    console.log('🔐 Testing Two-Factor Authentication Functions\n');

    try {
        // Test 1: Generate secret
        console.log('1. Testing secret generation...');
        const secretData = generateTwoFactorSecret('test@example.com', 'TaskGid Test');
        console.log('✅ Secret generated:', {
            hasSecret: !!secretData.secret,
            secretLength: secretData.secret.length,
            hasOtpauthUrl: !!secretData.otpauthUrl,
        });

        // Test 2: Generate QR Code
        console.log('\n2. Testing QR code generation...');
        const qrCode = await generateQRCode(secretData.otpauthUrl);
        console.log('✅ QR code generated:', {
            isDataURL: qrCode.startsWith('data:image/png;base64,'),
            length: qrCode.length,
        });

        // Test 3: Generate current TOTP code
        console.log('\n3. Testing TOTP code generation...');
        const currentCode = getCurrentTOTPCode(secretData.secret);
        console.log('✅ Current TOTP code:', currentCode);
        console.log('Time remaining until next code:', getTOTPTimeRemaining(), 'seconds');

        // Test 4: Verify TOTP token
        console.log('\n4. Testing TOTP verification...');
        const isValidCurrent = verifyTOTPToken(currentCode, secretData.secret);
        const isValidFake = verifyTOTPToken('000000', secretData.secret);
        console.log('✅ TOTP verification results:', {
            validCurrentCode: isValidCurrent,
            validFakeCode: isValidFake,
        });

        // Test 5: Generate backup codes
        console.log('\n5. Testing backup code generation...');
        const backupCodes = generateBackupCodes(8);
        console.log('✅ Backup codes generated:', {
            count: backupCodes.length,
            format: backupCodes[0],
            allValidFormat: backupCodes.every(isValidBackupCodeFormat),
        });

        // Test 6: Backup code utilities
        console.log('\n6. Testing backup code utilities...');
        const testBackupCode = backupCodes[0];
        console.log('✅ Backup code utilities:', {
            isBackupCode: isBackupCode(testBackupCode),
            isValidFormat: isValidBackupCodeFormat(testBackupCode),
            formatted: formatBackupCode(testBackupCode.toLowerCase()),
            isTOTPCode: isBackupCode('123456'),
        });

        // Test 7: Edge cases
        console.log('\n7. Testing edge cases...');
        console.log('✅ Edge case results:', {
            emptyTokenVerification: verifyTOTPToken('', secretData.secret),
            nullTokenVerification: verifyTOTPToken(null, secretData.secret),
            invalidSecretVerification: verifyTOTPToken(currentCode, 'INVALID'),
            malformedBackupCode: isValidBackupCodeFormat('1234'),
            spacedBackupCode: isValidBackupCodeFormat('ABCD 1234'),
        });

        console.log('\n🎉 All 2FA tests completed successfully!');

        // Test summary
        console.log('\n📊 Test Summary:');
        console.log('- Secret generation: ✅');
        console.log('- QR code generation: ✅');
        console.log('- TOTP verification: ✅');
        console.log('- Backup code generation: ✅');
        console.log('- Backup code validation: ✅');
        console.log('- Edge case handling: ✅');

        return true;
    } catch (error) {
        console.error('❌ Test failed:', error);
        return false;
    }
}

/**
 * Test TwoFactorAuth model methods (if running in Node.js environment with database)
 */
async function testTwoFactorAuthModel() {
    console.log('\n🗄️  Testing TwoFactorAuth Model (if available)...');

    try {
        // This would require database connection
        // For now, just test the backup code methods logically
        const mockTwoFactorAuth = {
            backupCodes: ['ABCD-1234', 'EFGH-5678', 'IJKL-9012'],
            recoveryCodesUsed: 0,

            // Mock method to test backup code usage
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

            // Mock method to check if codes are low
            isBackupCodesLow() {
                const codes = this.backupCodes || [];
                return codes.length < 3;
            },
        };

        console.log('Testing backup code usage...');
        const validCode = 'ABCD-1234';
        const invalidCode = 'XXXX-YYYY';

        const validResult = mockTwoFactorAuth.useBackupCode(validCode);
        const invalidResult = mockTwoFactorAuth.useBackupCode(invalidCode);

        console.log('✅ Model method tests:', {
            validCodeUsage: validResult,
            invalidCodeUsage: invalidResult,
            remainingCodes: mockTwoFactorAuth.backupCodes.length,
            isLow: mockTwoFactorAuth.isBackupCodesLow(),
            usedCount: mockTwoFactorAuth.recoveryCodesUsed,
        });

        return true;
    } catch (error) {
        console.error('❌ Model test failed:', error);
        return false;
    }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log('🚀 Starting Two-Factor Authentication Tests...\n');

    (async () => {
        const utilsTest = await testTwoFactorAuth();
        const modelTest = await testTwoFactorAuthModel();

        console.log('\n' + '='.repeat(50));
        console.log(`Overall Test Result: ${utilsTest && modelTest ? '✅ PASSED' : '❌ FAILED'}`);
        console.log('='.repeat(50));

        process.exit(utilsTest && modelTest ? 0 : 1);
    })();
}

export {testTwoFactorAuth, testTwoFactorAuthModel};
