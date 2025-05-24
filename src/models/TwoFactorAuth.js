import {DataTypes} from 'sequelize';
import sequelize from '../config/database.js';
import crypto from 'crypto';

const TwoFactorAuth = sequelize.define('TwoFactorAuth', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    userId: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        references: {
            model: 'users',
            key: 'id',
        },
        onDelete: 'CASCADE',
    },
    secret: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
            notEmpty: true,
        },
    },
    isEnabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    backupCodes: {
        type: DataTypes.TEXT,
        allowNull: true,
        get() {
            const value = this.getDataValue('backupCodes');
            return value ? JSON.parse(value) : [];
        },
        set(value) {
            this.setDataValue('backupCodes', JSON.stringify(value || []));
        },
    },
    lastUsedAt: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    recoveryCodesUsed: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
    },
}, {
    tableName: 'two_factor_auth',
    timestamps: true,
    indexes: [
        {
            fields: ['userId'],
            unique: true,
        },
    ],
    hooks: {
        beforeCreate: (instance) => {
            if (!instance.backupCodes || instance.backupCodes.length === 0) {
                instance.backupCodes = generateBackupCodes();
            }
        },
    },
});

/**
 * Generate secure backup codes
 * @return {Array<string>} Array of backup codes
 */
function generateBackupCodes() {
    const codes = [];
    for (let i = 0; i < 8; i++) {
        // Generate 8-character codes with format XXXX-XXXX
        const code = crypto.randomBytes(4).toString('hex').toUpperCase();
        const formattedCode = `${code.slice(0, 4)}-${code.slice(4, 8)}`;
        codes.push(formattedCode);
    }
    return codes;
}

/**
 * Instance method to regenerate backup codes
 * @return {Array<string>} New backup codes
 */
TwoFactorAuth.prototype.regenerateBackupCodes = function() {
    this.backupCodes = generateBackupCodes();
    this.recoveryCodesUsed = 0;
    return this.backupCodes;
};

/**
 * Instance method to use a backup code
 * @param {string} code - The backup code to use
 * @return {boolean} Whether the code was valid and used
 */
TwoFactorAuth.prototype.useBackupCode = function(code) {
    const codes = this.backupCodes || [];
    const index = codes.indexOf(code.toUpperCase());

    if (index === -1) {
        return false;
    }

    // Remove the used code
    codes.splice(index, 1);
    this.backupCodes = codes;
    this.recoveryCodesUsed += 1;
    this.lastUsedAt = new Date();

    return true;
};

/**
 * Instance method to check if backup codes are running low
 * @return {boolean} Whether backup codes are running low (< 3 remaining)
 */
TwoFactorAuth.prototype.isBackupCodesLow = function() {
    const codes = this.backupCodes || [];
    return codes.length < 3;
};

export default TwoFactorAuth;
