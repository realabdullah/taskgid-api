import {DataTypes} from 'sequelize';
import sequelize from '../config/database.js';
import Task from './Task.js';
import User from './User.js';

const TaskAssignee = sequelize.define('TaskAssignee', {
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
}, {
    tableName: 'task_assignees',
    timestamps: true,
    indexes: [
        {
            unique: true,
            fields: ['task_id', 'user_id'],
        },
    ],
});

// Define associations
TaskAssignee.belongsTo(Task, {foreignKey: 'taskId', as: 'task'});
TaskAssignee.belongsTo(User, {foreignKey: 'userId', as: 'user'});

export default TaskAssignee;
