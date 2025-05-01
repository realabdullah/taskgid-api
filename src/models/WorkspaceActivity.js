import {DataTypes} from 'sequelize';
import sequelize from '../config/database.js';

const WorkspaceActivity = sequelize.define('WorkspaceActivity', {
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
        field: 'workspace_id',
    },
    userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id',
        },
        field: 'user_id',
    },
    action: {
        // eslint-disable-next-line new-cap
        type: DataTypes.ENUM(
            'workspace_created',
            'workspace_updated',
            'workspace_deleted',
            'member_invited',
            'member_joined',
            'member_removed',
            'member_promoted',
            'member_demoted',
            'task_created',
            'task_updated',
            'task_deleted',
            'task_assigned',
            'task_unassigned',
        ),
        allowNull: false,
    },
    details: {
        type: DataTypes.JSONB,
        allowNull: true,
    },
}, {
    tableName: 'workspace_activities',
    timestamps: true,
    indexes: [
        {
            fields: ['workspace_id'],
        },
        {
            fields: ['user_id'],
        },
    ],
});

export default WorkspaceActivity;
