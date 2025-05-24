# Two-Factor Authentication (2FA) Feature

## Overview

This document describes the implementation of Two-Factor Authentication (2FA) for the TaskGid API. The 2FA system provides an additional layer of security using Time-based One-Time Passwords (TOTP) compatible with popular authenticator apps like Google Authenticator, Authy, and Microsoft Authenticator.

## Features

- **TOTP-based 2FA**: Uses Time-based One-Time Passwords with 30-second intervals
- **QR Code Setup**: Easy setup with QR codes for authenticator apps
- **Backup Codes**: 8 single-use backup codes for account recovery
- **Secure Storage**: Encrypted secrets and secure backup code management
- **Backup Code Management**: Automatic regeneration and low-code warnings
- **Login Integration**: Seamless integration with existing authentication flow
- **Security Features**: Rate limiting, proper validation, and secure defaults

## Database Schema

### TwoFactorAuth Model

```sql
CREATE TABLE two_factor_auth (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE,
    secret VARCHAR(255) NOT NULL,
    is_enabled BOOLEAN DEFAULT FALSE,
    backup_codes TEXT, -- JSON array of backup codes
    last_used_at TIMESTAMP,
    recovery_codes_used INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**Key Fields:**
- `secret`: Base32-encoded TOTP secret
- `is_enabled`: Whether 2FA is active for the user
- `backup_codes`: JSON array of recovery codes (format: "XXXX-XXXX")
- `recovery_codes_used`: Count of used backup codes
- `last_used_at`: Timestamp of last successful 2FA verification

## API Endpoints

### Base URL: `/api/auth/2fa`

All endpoints require authentication via `Authorization: Bearer <token>` header.

### 1. Get 2FA Status
**GET** `/status`

Get the current 2FA configuration status for the authenticated user.

**Response:**
```json
{
  "success": true,
  "data": {
    "isEnabled": true,
    "hasSecret": true,
    "backupCodesCount": 6,
    "isBackupCodesLow": false,
    "lastUsedAt": "2024-01-15T10:30:00Z",
    "recoveryCodesUsed": 2,
    "enabledAt": "2024-01-10T09:00:00Z"
  }
}
```

### 2. Generate 2FA Setup
**POST** `/setup`

Generate a new 2FA secret and QR code for setup. This doesn't enable 2FA yet.

**Response:**
```json
{
  "success": true,
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",
    "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "manualEntryKey": "JBSWY3DPEHPK3PXP",
    "issuer": "TaskGid",
    "accountName": "user@example.com",
    "message": "Scan the QR code with your authenticator app, then verify with a code to complete setup"
  }
}
```

### 3. Enable 2FA
**POST** `/enable`

Verify the setup and enable 2FA by providing a valid TOTP code.

**Request Body:**
```json
{
  "token": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "2FA has been successfully enabled for your account",
    "backupCodes": [
      "1234-5678",
      "9ABC-DEF0",
      "2468-ACEG",
      "1357-BDF9",
      "3691-BE47",
      "258A-CF6E",
      "147B-369D",
      "789C-DEF1"
    ],
    "warning": "Please save these backup codes in a safe place. They can be used to access your account if you lose your authenticator device."
  }
}
```

### 4. Disable 2FA
**POST** `/disable`

Disable 2FA after verifying the current password and a 2FA code.

**Request Body:**
```json
{
  "password": "currentPassword",
  "token": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "2FA has been successfully disabled for your account"
  }
}
```

### 5. Verify 2FA Token
**POST** `/verify`

Verify a 2FA token without consuming it (for testing/validation).

**Request Body:**
```json
{
  "token": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "tokenType": "totp",
    "timeRemaining": 25
  }
}
```

### 6. Get Backup Codes Info
**GET** `/backup-codes`

Get information about backup codes without revealing them.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalCodes": 8,
    "remainingCodes": 6,
    "usedCodes": 2,
    "isLow": false,
    "recommendation": null
  }
}
```

### 7. Regenerate Backup Codes
**POST** `/backup-codes/regenerate`

Generate new backup codes, invalidating all previous ones.

**Request Body:**
```json
{
  "token": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "backupCodes": [
      "ABCD-1234",
      "EFGH-5678",
      "IJKL-9012",
      "MNOP-3456",
      "QRST-7890",
      "UVWX-2345",
      "YZAB-6789",
      "CDEF-0123"
    ],
    "message": "New backup codes have been generated. Please save them in a safe place.",
    "warning": "Your old backup codes are no longer valid."
  }
}
```

## Modified Login Flow

The existing login endpoint (`POST /api/auth/login`) has been enhanced to support 2FA:

### Standard Login (No 2FA)
**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

### 2FA Required Response
When 2FA is enabled, the login will return:

**Status:** 428 Precondition Required
```json
{
  "success": false,
  "message": "Two-factor authentication code is required",
  "data": {
    "requiresTwoFactor": true,
    "userId": "user-id-for-frontend-state",
    "message": "Please provide your 6-digit authenticator code or backup code"
  }
}
```

### Login with 2FA
**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "twoFactorToken": "123456"
}
```

**Success Response:**
```json
{
  "success": true,
  "data": {
    "user": { /* user object */ },
    "accessToken": {
      "token": "jwt-token",
      "expires": 3600
    },
    "refreshToken": {
      "token": "refresh-token"
    }
  }
}
```

### Backup Code Warning
When logging in with a backup code and running low:

```json
{
  "success": true,
  "data": {
    "user": { /* user object */ },
    "accessToken": { /* tokens */ },
    "refreshToken": { /* tokens */ },
    "warning": {
      "type": "backup_codes_low",
      "message": "You have less than 3 backup codes remaining. Consider regenerating them.",
      "backupCodesRemaining": 2
    }
  }
}
```

## Security Features

### Rate Limiting
- All 2FA endpoints are protected by the existing auth rate limiter
- Failed verification attempts are logged and monitored

### Token Validation
- TOTP tokens: 6-digit numeric codes with 30-second windows
- Backup codes: 8-character format (XXXX-XXXX) with single use
- Time window: ±1 period (90 seconds total) for clock skew tolerance

### Secure Storage
- TOTP secrets are stored as Base32-encoded strings
- Backup codes are stored as JSON arrays in the database
- All sensitive operations require user authentication

### Backup Code Management
- 8 codes generated per user initially
- Codes are single-use and removed after consumption
- Automatic warnings when fewer than 3 codes remain
- Secure regeneration process requiring 2FA verification

## Usage Examples

### Frontend Implementation

```javascript
// Check 2FA status
const status = await fetch('/api/auth/2fa/status', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// Setup 2FA
const setup = await fetch('/api/auth/2fa/setup', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
const { qrCode, secret } = setup.data;

// Enable 2FA after user scans QR and enters code
const enable = await fetch('/api/auth/2fa/enable', {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ token: userEnteredCode })
});

// Login with 2FA
const loginResponse = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123',
    twoFactorToken: '123456' // from authenticator app
  })
});
```

### Authenticator App Compatibility

The 2FA implementation is compatible with:
- Google Authenticator
- Microsoft Authenticator
- Authy
- 1Password
- Bitwarden
- Any RFC 6238 compliant TOTP app

### Setup Process
1. User requests 2FA setup
2. System generates secret and QR code
3. User scans QR code with authenticator app
4. User enters verification code
5. System validates code and enables 2FA
6. System provides backup codes for safe storage

## Error Handling

### Common Error Responses

**Invalid 2FA Code (401):**
```json
{
  "success": false,
  "message": "Invalid two-factor authentication code",
  "data": {
    "requiresTwoFactor": true,
    "errorType": "invalid_2fa_code",
    "tokenType": "totp"
  }
}
```

**2FA Not Enabled (400):**
```json
{
  "success": false,
  "message": "2FA is not enabled for this account"
}
```

**Setup Required (404):**
```json
{
  "success": false,
  "message": "2FA setup not found. Please generate setup first."
}
```

## Best Practices

### For Users
1. **Save Backup Codes**: Store backup codes securely offline
2. **Use Secure Apps**: Use reputable authenticator applications
3. **Regular Verification**: Verify codes work before completing setup
4. **Monitor Usage**: Check 2FA status regularly in account settings

### For Developers
1. **Secure Storage**: Never log or expose TOTP secrets
2. **Rate Limiting**: Implement proper rate limiting for verification attempts
3. **Time Synchronization**: Ensure server time is properly synchronized
4. **Backup Strategy**: Provide clear backup code management
5. **User Education**: Provide clear setup instructions and warnings

## Performance Considerations

- **Database Queries**: 2FA lookup adds one additional query to login
- **QR Generation**: QR codes are generated on-demand, consider caching
- **Memory Usage**: TOTP verification is CPU-light with minimal memory impact
- **Storage**: Minimal storage overhead (< 1KB per user)

## Future Enhancements

- **SMS Backup**: Optional SMS-based backup verification
- **Hardware Keys**: WebAuthn/FIDO2 integration for hardware tokens  
- **Trusted Devices**: Remember devices for reduced 2FA prompts
- **Admin Controls**: Workspace-level 2FA requirements
- **Audit Logging**: Enhanced logging for 2FA events
- **Recovery Options**: Additional account recovery mechanisms

## Testing

### Test Scenarios
1. **Setup Flow**: Complete 2FA setup process
2. **Login Flow**: Login with 2FA enabled
3. **Backup Codes**: Use backup codes for login
4. **Disable 2FA**: Disable and re-enable 2FA
5. **Error Cases**: Invalid codes, expired tokens, etc.

### Test Accounts
Use test authenticator apps or libraries for automated testing:
```javascript
// Example test with speakeasy
const speakeasy = require('speakeasy');
const token = speakeasy.totp({
  secret: testSecret,
  encoding: 'base32'
});
```

## Troubleshooting

### Common Issues

1. **Time Sync Issues**: Verify server and client time synchronization
2. **Invalid Codes**: Check TOTP window settings and clock drift
3. **Backup Code Format**: Ensure proper format (XXXX-XXXX)
4. **Rate Limiting**: Monitor for excessive verification attempts

### Debugging Tips

1. Check server logs for 2FA verification attempts
2. Verify TOTP secret encoding (Base32)
3. Test with known working TOTP libraries
4. Validate database storage and retrieval of secrets 