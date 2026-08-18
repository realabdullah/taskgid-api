import {DataTypes, Model} from 'sequelize';
import sequelize from '../config/database.js';

/**
 * A schedule that produces tasks.
 *
 * The rule holds the template for every instance it will create. It is separate
 * from the tasks it has already created so that completing, editing or deleting
 * one instance leaves the schedule untouched — which is the whole point of
 * spawning instances rather than moving a single task's due date forward.
 * @extends Model
 */
class TaskRecurrence extends Model {}

TaskRecurrence.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        rrule: {
            /*
             * An RFC 5545 rule, stored as the string a calendar client would
             * send. Always written with an explicit DTSTART: a rule parsed
             * without one takes its time-of-day from the moment it is parsed,
             * so occurrence times would drift with every run.
             */
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
            /*
             * Held as ids on the rule rather than through `task_assignees`,
             * because they describe who *will* be assigned. A join row has to
             * point at a task, and the task does not exist until the occurrence
             * comes due.
             */
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
            /*
             * The most recent occurrence already turned into a task, not the
             * time the spawner last ran. Occurrences are claimed strictly after
             * this instant, so running twice cannot duplicate a task and
             * missing a run catches up on the next one.
             */
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
