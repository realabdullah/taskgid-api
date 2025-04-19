import {DataTypes, Model} from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Invite model representing workspace invitations
 * @extends Model
 */
class Invite extends Model {}

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
    },
);

export default Invite;
