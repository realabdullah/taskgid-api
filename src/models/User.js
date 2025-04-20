import {DataTypes, Model} from 'sequelize';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import sequelize from '../config/database.js';
import 'dotenv/config';

// Token configuration
const ACCESS_TOKEN = {
    secret: process.env.ACCESS_TOKEN_SECRET,
    expiry: process.env.ACCESS_TOKEN_EXPIRY || '1h',
};
const REFRESH_TOKEN = {
    secret: process.env.REFRESH_TOKEN_SECRET,
    expiry: process.env.REFRESH_TOKEN_EXPIRY || '30d',
};
const RESET_PASSWORD_TOKEN = {
    expiry: process.env.RESET_PASSWORD_TOKEN_EXPIRY || 60, // minutes
};

/**
 * User model representing application users
 * @extends Model
 */
class User extends Model {
    /**
     * Generate an access token for the user
     * @return {Promise<string>} The generated access token
     */
    async generateAccessToken() {
        const token = jwt.sign({id: this.id}, ACCESS_TOKEN.secret, {
            expiresIn: ACCESS_TOKEN.expiry,
        });

        const accessTokenHash = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

        this.token = accessTokenHash;
        await this.save();

        return token;
    }

    /**
     * Generate a refresh token for the user
     * @return {Promise<string>} The generated refresh token
     */
    async generateRefreshToken() {
        return jwt.sign({id: this.id}, REFRESH_TOKEN.secret, {
            expiresIn: REFRESH_TOKEN.expiry,
        });
    }

    /**
     * Generate a password reset token for the user
     * @return {Promise<string>} The generated reset token
     */
    async generateResetPasswordToken() {
        const token = crypto.randomBytes(20).toString('base64url');
        const secret = crypto.randomBytes(10).toString('hex');

        const resetToken = `${token}.${secret}`;
        const resetTokenHash = crypto
            .createHmac('sha256', secret)
            .update(token)
            .digest('hex');

        this.resetPasswordToken = resetTokenHash;
        this.resetPasswordExpires = new Date(Date.now() + RESET_PASSWORD_TOKEN.expiry * 60 * 1000);

        await this.save();

        return resetToken;
    }

    /**
     * Find a user by email and password
     * @param {string} email - User's email
     * @param {string} password - User's password
     * @return {Promise<User>} The authenticated user
     * @throws {Error} If credentials are invalid
     */
    static async findByCredentials(email, password) {
        const user = await this.findOne({where: {email}});
        if (!user) {
            throw new Error('Invalid email or password');
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            throw new Error('Invalid email or password');
        }

        return user;
    }

    /**
     * Convert user instance to JSON, excluding sensitive fields
     * @return {Object} JSON representation of the user
     */
    toJSON() {
        const values = {...this.get()};
        delete values.password;
        delete values.token;
        delete values.resetPasswordToken;
        delete values.resetPasswordExpires;
        delete values.challenge;
        return values;
    }
}

// Define the model
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
            unique: true,
            validate: {
                isEmail: true,
            },
        },
        username: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        profilePicture: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        token: {
            type: DataTypes.STRING,
            allowNull: true,
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
            defaultValue: '',
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
        },
        registrationSource: {
            // eslint-disable-next-line new-cap
            type: DataTypes.ENUM('invite', 'self'),
            allowNull: false,
            defaultValue: 'self',
        },
    },
    {
        sequelize,
        modelName: 'User',
        tableName: 'users',
        hooks: {
            beforeSave: async (user) => {
                if (user.changed('password')) {
                    const saltRounds = 10;
                    user.password = await bcrypt.hash(user.password, saltRounds);
                }

                if (user.isNewRecord) {
                    // Check if email already exists
                    const existingUser = await User.findOne({where: {email: user.email}});
                    if (existingUser) {
                        throw new Error('An account with this email already exists');
                    }

                    // Generate profile picture from initials
                    const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
                    const initials = name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase();
                    user.profilePicture = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                        initials,
                    )}&background=random`;
                }
            },
        },
    },
);

export default User;
