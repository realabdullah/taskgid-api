/* eslint-disable new-cap */
import {DataTypes} from 'sequelize';
import sequelize from '../config/database.js';

/**
 * WorkspaceTeam model representing the many-to-many relationship between workspaces and users
 */
const WorkspaceTeam = sequelize.define('WorkspaceTeam', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    workspaceId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'workspaces',
            key: 'id',
        },
        onDelete: 'CASCADE',
    },
    userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id',
        },
        onDelete: 'CASCADE',
    },
    role: {
        type: DataTypes.ENUM('creator', 'admin', 'member'),
        allowNull: false,
        defaultValue: 'member',
    },
}, {
    sequelize,
    modelName: 'WorkspaceTeam',
    tableName: 'workspace_teams',
    timestamps: true,
    indexes: [
        {
            unique: true,
            fields: ['user_id', 'workspace_id'],
        },
    ],
});

export default WorkspaceTeam;
