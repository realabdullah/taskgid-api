import {DataTypes, Model} from 'sequelize';
import sequelize from '../config/database.js';

/** A schedule that produces tasks, holding the template for each instance. */
class TaskRecurrence extends Model {}

TaskRecurrence.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        rrule: {
            // RFC 5545. Must carry an explicit DTSTART — without one, rrule
            // takes the time-of-day from the moment of parsing.
            type: DataTypes.TEXT,
            allowNull: false,
        },
        timezone: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'UTC',
        },
        title: {type: DataTypes.STRING, allowNull: false},
        description: {type: DataTypes.TEXT, allowNull: true},
        priority: {
            // eslint-disable-next-line new-cap
            type: DataTypes.ENUM('low', 'medium', 'high'),
            allowNull: false,
            defaultValue: 'medium',
        },
        estimateMinutes: {type: DataTypes.INTEGER, allowNull: true},
        checklist: {
            // Copied onto each instance with every item reset to undone.
            type: DataTypes.JSONB,
            allowNull: false,
            defaultValue: [],
        },
        assigneeIds: {
            // Ids, not `task_assignees` rows: the task does not exist yet.
            type: DataTypes.JSONB,
            allowNull: false,
            defaultValue: [],
        },
        tagIds: {
            type: DataTypes.JSONB,
            allowNull: false,
            defaultValue: [],
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        lastSpawnedAt: {
            // The last occurrence turned into a task, not the last run time.
            // Occurrences are claimed strictly after it, so a repeated run
            // cannot duplicate and a missed run catches up.
            type: DataTypes.DATE,
            allowNull: true,
        },
        workspaceId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {model: 'workspaces', key: 'id'},
        },
        createdById: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {model: 'users', key: 'id'},
        },
    },
    {
        sequelize,
        modelName: 'TaskRecurrence',
        tableName: 'task_recurrences',
        timestamps: true,
    },
);

export default TaskRecurrence;
