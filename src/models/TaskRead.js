import {DataTypes, Model} from 'sequelize';
import sequelize from '../config/database.js';

/**
 * When a user last read a task's discussion.
 *
 * One row per user per task. Anything created after `lastReadAt` counts as
 * unread, which is enough to mark a task and count its new comments without
 * storing per-comment state.
 */
class TaskRead extends Model {}

TaskRead.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        taskId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        lastReadAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
    },
    {
        sequelize,
        modelName: 'TaskRead',
        tableName: 'task_reads',
        timestamps: true,
        underscored: true,
        indexes: [{unique: true, fields: ['user_id', 'task_id']}],
    },
);

export default TaskRead;
