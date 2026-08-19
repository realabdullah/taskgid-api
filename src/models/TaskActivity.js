import {DataTypes} from 'sequelize';
import sequelize from '../config/database.js';

const TaskActivity = sequelize.define('TaskActivity', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    taskId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'tasks',
            key: 'id',
        },
        field: 'task_id',
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
            'created',
            'updated',
            'status_changed',
            'priority_changed',
            'assigned',
            'unassigned',
            'comment_added',
            'attachment_added',
            'tags_added',
            'tags_removed',
            'deleted',
        ),
        allowNull: false,
    },
    source: {
        // eslint-disable-next-line new-cap
        type: DataTypes.ENUM('user', 'agent'),
        allowNull: false,
        defaultValue: 'user',
    },
    details: {
        type: DataTypes.JSONB,
        allowNull: true,
    },
}, {
    tableName: 'task_activities',
    timestamps: true,
    indexes: [
        {
            fields: ['task_id'],
        },
        {
            fields: ['user_id'],
        },
    ],
});

export default TaskActivity;
