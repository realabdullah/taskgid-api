import {DataTypes, Model} from 'sequelize';
import sequelize from '../config/database.js';
import crypto from 'crypto';

/**
 * Invite model representing workspace invitations
 * @extends Model
 */
class Invite extends Model {
    /**
     * Generate a secure invitation token
     * @return {string} A secure token
     */
    static generateToken() {
        return crypto.randomBytes(32).toString('base64url');
    }
}

// Define the model
Invite.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false,
            validate: {
                isEmail: true,
            },
        },
        token: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            defaultValue: () => Invite.generateToken(),
        },
        expires_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        },
        invitedById: {
            type: DataTypes.UUID,
            allowNull: true, // Allow null if invite is system-generated or sender is unknown
            references: {
                model: 'users',
                key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
        },
        used: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        workspaceId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'workspaces',
                key: 'id',
            },
        },
    },
    {
        sequelize,
        modelName: 'Invite',
        tableName: 'invites',
        indexes: [
            {
                unique: true,
                fields: ['email', 'workspace_id'],
                where: {
                    used: false,
                },
            },
        ],
        hooks: {
            beforeCreate: (invite) => {
                if (!invite.token) {
                    invite.token = Invite.generateToken();
                }
            },
        },
    },
);

export default Invite;
