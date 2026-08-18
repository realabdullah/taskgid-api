'use strict';

const {
    addColumnIfMissing,
    addIndexIfMissing,
    createTableIfMissing,
    removeColumnIfPresent,
} = require('../scripts/migration-helpers.cjs');

/**
 * Recurring tasks.
 *
 * The rule is a record of its own rather than columns on a task, because a rule
 * outlives any one instance: completing this week's task must not disturb the
 * schedule, and the schedule must survive that task being deleted.
 *
 * `rrule` holds an RFC 5545 string. The format is not invented here — it is what
 * calendar clients already speak, so an ICS feed can serve these rules directly
 * instead of translating them.
 *
 * Assignees and tags are stored as id arrays on the rule rather than through the
 * task join tables: they are the template for future instances, not an
 * assignment of anything that exists yet, and giving them join tables would mean
 * rows pointing at a task that has not been created.
 */
module.exports = {
    async up(queryInterface, Sequelize) {
        await createTableIfMissing(queryInterface, 'task_recurrences', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true,
            },
            workspace_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {model: 'workspaces', key: 'id'},
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
            },
            created_by_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {model: 'users', key: 'id'},
                onUpdate: 'CASCADE',
            },
            rrule: {
                type: Sequelize.TEXT,
                allowNull: false,
            },
            timezone: {
                // The zone the rule's wall-clock times mean. "Every Monday at
                // 09:00" is a different instant in Lagos and Berlin.
                type: Sequelize.STRING,
                allowNull: false,
                defaultValue: 'UTC',
            },
            title: {type: Sequelize.STRING, allowNull: false},
            description: {type: Sequelize.TEXT, allowNull: true},
            priority: {
                type: Sequelize.ENUM('low', 'medium', 'high'),
                allowNull: false,
                defaultValue: 'medium',
            },
            estimate_minutes: {type: Sequelize.INTEGER, allowNull: true},
            checklist: {
                type: Sequelize.JSONB,
                allowNull: false,
                defaultValue: [],
            },
            assignee_ids: {
                type: Sequelize.JSONB,
                allowNull: false,
                defaultValue: [],
            },
            tag_ids: {
                type: Sequelize.JSONB,
                allowNull: false,
                defaultValue: [],
            },
            is_active: {
                type: Sequelize.BOOLEAN,
                allowNull: false,
                defaultValue: true,
            },
            last_spawned_at: {
                /*
                 * The occurrence most recently turned into a task — not the time
                 * the spawner ran. Occurrences are claimed strictly after this
                 * instant, so a run that happens twice cannot produce the same
                 * task twice, and a run that is skipped catches up.
                 */
                type: Sequelize.DATE,
                allowNull: true,
            },
            created_at: {type: Sequelize.DATE, allowNull: false},
            updated_at: {type: Sequelize.DATE, allowNull: false},
        });

        await addIndexIfMissing(queryInterface, 'task_recurrences', ['workspace_id'], {
            name: 'task_recurrences_workspace_id_idx',
        });
        // The spawner's only query: every active rule, across workspaces.
        await addIndexIfMissing(queryInterface, 'task_recurrences', ['is_active'], {
            name: 'task_recurrences_is_active_idx',
        });

        await addColumnIfMissing(queryInterface, 'tasks', 'recurrence_id', {
            type: Sequelize.UUID,
            allowNull: true,
            references: {model: 'task_recurrences', key: 'id'},
            onUpdate: 'CASCADE',
            // Deleting a rule stops future instances; it does not retract the
            // work already done under it.
            onDelete: 'SET NULL',
        });

        await addColumnIfMissing(queryInterface, 'tasks', 'occurrence_date', {
            // Which occurrence this task is. Lets the spawner prove an
            // occurrence has already been created, and lets a completed
            // instance be attributed to the right period afterwards.
            type: Sequelize.DATE,
            allowNull: true,
        });

        await addIndexIfMissing(queryInterface, 'tasks', ['recurrence_id', 'occurrence_date'], {
            name: 'tasks_recurrence_occurrence_idx',
        });
    },

    async down(queryInterface) {
        await queryInterface.removeIndex('tasks', 'tasks_recurrence_occurrence_idx').catch(() => {});
        await removeColumnIfPresent(queryInterface, 'tasks', 'occurrence_date');
        await removeColumnIfPresent(queryInterface, 'tasks', 'recurrence_id');
        await queryInterface.dropTable('task_recurrences').catch(() => {});
        await queryInterface.sequelize
            .query('DROP TYPE IF EXISTS "enum_task_recurrences_priority";')
            .catch(() => {});
    },
};
