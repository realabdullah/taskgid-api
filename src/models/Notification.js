import {DataTypes} from 'sequelize';
import sequelize from '../config/database.js';
import User from './User.js';
import Task from './Task.js';
import Comment from './Comment.js';

const Notification = sequelize.define('Notification', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id',
        },
    },
    type: {
        // eslint-disable-next-line new-cap
        type: DataTypes.ENUM(
            'mention',
            'task_assigned',
            'task_updated',
            'comment_reply',
            'comment_like',
            'workspace_invite',
            'workspace_role_changed',
            'task_completed',
            'task_deleted',
        ),
        allowNull: false,
    },
    read: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    taskId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'tasks',
            key: 'id',
        },
    },
    commentId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'comments',
            key: 'id',
        },
    },
    actorId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'users',
            key: 'id',
        },
    },
    message: {
        type: DataTypes.STRING,
        allowNull: false,
    },
}, {
    tableName: 'notifications',
    timestamps: true,
});

// Define associations
Notification.belongsTo(User, {foreignKey: 'userId', as: 'user'});
Notification.belongsTo(User, {foreignKey: 'actorId', as: 'actor'});
Notification.belongsTo(Task, {foreignKey: 'taskId', as: 'task'});
Notification.belongsTo(Comment, {foreignKey: 'commentId', as: 'comment'});

export default Notification;
