import {DataTypes, Model} from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Task model representing project tasks
 * @extends Model
 */
class Task extends Model {
    /**
     * Convert task instance to JSON, adding formatted assignee and creator information
     * @return {Object} JSON representation of the task
     */
    toJSON() {
        const values = {...this.get()};

        // Format assignee information
        if (this.assignee) {
            values.assigneeName = this.assignee.username;
        }

        // Format creator information
        if (this.user) {
            values.creatorName = `${this.user.firstName} ${this.user.lastName}`;
            values.creatorUsername = this.user.username;
        }

        return values;
    }
}

// Define the model
Task.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        title: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        status: {
            // eslint-disable-next-line new-cap
            type: DataTypes.ENUM('todo', 'in_progress', 'done'),
            allowNull: false,
            defaultValue: 'todo',
        },
        priority: {
            // eslint-disable-next-line new-cap
            type: DataTypes.ENUM('low', 'medium', 'high'),
            allowNull: false,
            defaultValue: 'medium',
        },
        dueDate: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        workspaceId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'workspaces',
                key: 'id',
            },
        },
        createdById: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id',
            },
        },
    },
    {
        sequelize,
        modelName: 'Task',
        tableName: 'tasks',
        timestamps: true,
    },
);

export default Task;
