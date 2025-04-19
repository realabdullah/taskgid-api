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
    },
    userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id',
        },
    },
    isAdmin: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
}, {
    sequelize,
    modelName: 'WorkspaceTeam',
    tableName: 'workspace_teams',
    timestamps: true,
});

export default WorkspaceTeam;
