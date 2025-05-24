-- Migration: Add Two-Factor Authentication table
-- Description: Creates table for storing user 2FA secrets, backup codes, and settings
-- Author: System
-- Date: 2024

-- Create two_factor_auth table
CREATE TABLE IF NOT EXISTS two_factor_auth (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    secret VARCHAR(255) NOT NULL,
    is_enabled BOOLEAN DEFAULT FALSE,
    backup_codes TEXT,
    last_used_at TIMESTAMP,
    recovery_codes_used INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key constraint
    CONSTRAINT fk_two_factor_auth_user 
        FOREIGN KEY (user_id) 
        REFERENCES users(id) 
        ON DELETE CASCADE,
    
    -- Constraints
    CONSTRAINT chk_secret_not_empty CHECK (LENGTH(TRIM(secret)) > 0),
    CONSTRAINT chk_recovery_codes_used_positive CHECK (recovery_codes_used >= 0)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_two_factor_auth_user_id ON two_factor_auth(user_id);
CREATE INDEX IF NOT EXISTS idx_two_factor_auth_enabled ON two_factor_auth(is_enabled) WHERE is_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_two_factor_auth_last_used ON two_factor_auth(last_used_at);

-- Add trigger to update updated_at column
CREATE OR REPLACE FUNCTION update_two_factor_auth_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_two_factor_auth_updated_at
    BEFORE UPDATE ON two_factor_auth
    FOR EACH ROW
    EXECUTE FUNCTION update_two_factor_auth_updated_at();

-- Comments for documentation
COMMENT ON TABLE two_factor_auth IS 'Stores two-factor authentication settings and secrets for users';
COMMENT ON COLUMN two_factor_auth.id IS 'Primary key UUID';
COMMENT ON COLUMN two_factor_auth.user_id IS 'Foreign key to users table, unique per user';
COMMENT ON COLUMN two_factor_auth.secret IS 'Base32 encoded TOTP secret';
COMMENT ON COLUMN two_factor_auth.is_enabled IS 'Whether 2FA is currently enabled for this user';
COMMENT ON COLUMN two_factor_auth.backup_codes IS 'JSON array of backup codes for account recovery';
COMMENT ON COLUMN two_factor_auth.last_used_at IS 'Timestamp of last successful 2FA verification';
COMMENT ON COLUMN two_factor_auth.recovery_codes_used IS 'Count of backup codes that have been used';
COMMENT ON COLUMN two_factor_auth.created_at IS 'Record creation timestamp';
COMMENT ON COLUMN two_factor_auth.updated_at IS 'Record last update timestamp';

-- Optional: Add sample data for testing (uncomment if needed for development)
/*
-- Example of inserting test 2FA record (replace with actual test user ID)
INSERT INTO two_factor_auth (
    user_id, 
    secret, 
    is_enabled, 
    backup_codes
) VALUES (
    -- Replace with actual user UUID from your users table
    (SELECT id FROM users WHERE email = 'test@example.com' LIMIT 1),
    'JBSWY3DPEHPK3PXP',  -- Example secret (do not use in production)
    FALSE,
    '["1234-5678", "9ABC-DEF0", "2468-ACEG", "1357-BDF9", "3691-BE47", "258A-CF6E", "147B-369D", "789C-DEF1"]'
);
*/

-- Verify the table was created successfully
SELECT 
    table_name, 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'two_factor_auth' 
ORDER BY ordinal_position; 