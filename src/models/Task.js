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
        startDate: {
            // When work is meant to begin. Paired with dueDate it gives a task a
            // span rather than a single deadline, which any timeline view needs.
            type: DataTypes.DATE,
            allowNull: true,
        },
        estimateMinutes: {
            // Stored in minutes so the API never has to guess what "2" means.
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        checklist: {
            /*
             * An ordered list of {id, text, done} items, held on the task rather
             * than in their own table. Checklist items are never queried,
             * filtered or reported on independently — they are read and written
             * with their task — so a column avoids a join and a migration per
             * change of shape. Subtasks, which do need identity of their own,
             * are a separate concern.
             */
            type: DataTypes.JSONB,
            allowNull: false,
            defaultValue: [],
        },
        recurrenceId: {
            // The schedule that produced this task, if any. Nulled rather than
            // cascaded when a rule is deleted: ending a schedule does not
            // retract the work already done under it.
            type: DataTypes.UUID,
            allowNull: true,
            references: {
                model: 'task_recurrences',
                key: 'id',
            },
        },
        occurrenceDate: {
            // Which occurrence of that schedule this task is, so a completed
            // instance stays attributable to its period.
            type: DataTypes.DATE,
            allowNull: true,
        },
        parentId: {
            /*
             * The task this one is a subtask of; NULL means top-level. A
             * subtask has its own assignee, due date and tags — that is what
             * separates it from a checklist item. Completion does not cascade
             * in either direction: a parent reports its children's progress
             * rather than enforcing it.
             */
            type: DataTypes.UUID,
            allowNull: true,
            references: {
                model: 'tasks',
                key: 'id',
            },
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
