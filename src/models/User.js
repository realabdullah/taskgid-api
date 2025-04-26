import {DataTypes, Model} from 'sequelize';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import sequelize from '../config/database.js';

/**
 * User model representing application users
 * @extends Model
 */
class User extends Model {
    /**
     * Generate a password reset token for the user
     * @return {Promise<string>} The generated reset token
     */
    async generateResetPasswordToken() {
        const resetToken = crypto.randomBytes(32).toString('hex');
        this.resetPasswordToken = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');
        this.resetPasswordExpires = Date.now() + 10 * 60 * 1000;
        return resetToken;
    }

    /**
     * Find a user by email and password
     * @param {string} email - User's email
     * @param {string} password - User's password
     * @return {Promise<User|null>} The authenticated user or null if not found/invalid credentials
     */
    static async findByCredentials(email, password) {
        const user = await this.findOne({where: {email}});
        if (!user) return null;

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return null;

        return user;
    }

    /**
     * Check if the provided password matches the user's current password.
     * @param {string} candidatePassword - The password attempt to check.
     * @return {Promise<boolean>} - True if the password matches, false otherwise.
     */
    async isPasswordMatch(candidatePassword) {
        if (!this.password || typeof candidatePassword !== 'string') return false;
        return bcrypt.compare(candidatePassword, this.password);
    }

    /**
     * Convert user instance to JSON, excluding sensitive fields
     * @return {Object} JSON representation of the user
     */
    toJSON() {
        const values = this.get({plain: true});

        delete values.password;
        delete values.resetPasswordToken;
        delete values.resetPasswordExpires;
        delete values.challenge;

        return values;
    }
}

User.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        firstName: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        lastName: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: {
                name: 'users_email_key',
                msg: 'An account with this email already exists.',
            },
            validate: {
                isEmail: {
                    msg: 'Please provide a valid email address.',
                },
            },
        },
        username: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: {
                name: 'users_username_key',
                msg: 'This username is already taken.',
            },
            validate: {
                notEmpty: {
                    msg: 'Username cannot be empty.',
                },
                len: {
                    args: [3, 30],
                    msg: 'Username must be between 3 and 30 characters.',
                },
            },
        },
        profilePicture: {
            type: DataTypes.STRING,
            allowNull: true,
            validate: {
                isUrl: {
                    msg: 'Please provide a valid URL for the profile picture.',
                },
            },
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        resetPasswordToken: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        resetPasswordExpires: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        challenge: {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: null,
        },
        challengeTimestamp: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        invitedBy: {
            type: DataTypes.UUID,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
        },
        registrationSource: {
            // eslint-disable-next-line new-cap
            type: DataTypes.ENUM('invite', 'self'),
            allowNull: false,
            defaultValue: 'self',
        },
        title: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        about: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        location: {
            type: DataTypes.STRING,
            allowNull: true,
        },
    },
    {
        sequelize,
        modelName: 'User',
        tableName: 'users',
        timestamps: true,
        hooks: {
            beforeSave: async (user, options) => {
                if (user.changed('password') && user.password !== user.previous('password')) {
                    const saltRounds = 10;
                    user.password = await bcrypt.hash(user.password, saltRounds);
                }
            },
            beforeCreate: async (user, options) => {
                const existingUser = await User.findOne({where: {email: user.email}, transaction: options.transaction});
                if (existingUser) throw new Error('An account with this email already exists');

                if (!user.profilePicture && (user.firstName || user.lastName)) {
                    const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
                    if (name) {
                        const initials = name
                            .split(' ')
                            .filter((n) => n)
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase();
                        if (initials) {
                            user.profilePicture = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                                initials,
                            )}&background=random&size=128`;
                        }
                    }
                }
            },
        },
        indexes: [
            {
                unique: true,
                fields: ['email'],
            },
            {
                unique: true,
                fields: ['username'],
            },
        ],
    },
);

export default User;
