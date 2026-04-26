import {DataTypes} from 'sequelize';
import sequelize from '../config/database.js';

const TaskTag = sequelize.define('TaskTag', {
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
        onDelete: 'CASCADE',
    },
    tagId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'tags',
            key: 'id',
        },
        onDelete: 'CASCADE',
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
    },
}, {
    tableName: 'task_tags',
    timestamps: false,
    indexes: [
        {
            unique: true,
            fields: ['task_id', 'tag_id'],
            name: 'unique_task_tag',
        },
        {
            fields: ['task_id'],
        },
        {
            fields: ['tag_id'],
        },
    ],
});

export default TaskTag;
