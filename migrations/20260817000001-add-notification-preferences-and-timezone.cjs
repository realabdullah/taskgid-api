'use strict';

const {
    addColumnIfMissing,
    addIndexIfMissing,
    createTableIfMissing,
    removeColumnIfPresent,
} = require('../scripts/migration-helpers.cjs');

/**
 * Per-user notification preferences, a timezone on the user, and the read
 * markers behind unread comment counts.
 *
 * `users.timezone` is the critical one: the User model declares it, so every
 * query that touches a user selects it. Without this migration the column is
 * missing on any database built by sync(), and login fails outright.
 */
module.exports = {
    async up(queryInterface, Sequelize) {
        await addColumnIfMissing(queryInterface, 'users', 'timezone', {
            type: Sequelize.STRING,
            allowNull: true,
            defaultValue: 'UTC',
        });

        await createTableIfMissing(queryInterface, 'notification_preferences', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.literal('gen_random_uuid()'),
                primaryKey: true,
            },
            user_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {model: 'users', key: 'id'},
                onDelete: 'CASCADE',
            },
            workspace_id: {
                // Null is the account-wide default.
                type: Sequelize.UUID,
                allowNull: true,
                references: {model: 'workspaces', key: 'id'},
                onDelete: 'CASCADE',
            },
            task_assigned: {type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true},
            task_updated: {type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true},
            task_completed: {type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true},
            comment_created: {type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true},
            comment_liked: {type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false},
            mentioned: {type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true},
            workspace_invite: {type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true},
            in_app_enabled: {type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true},
            email_enabled: {type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true},
            daily_digest: {type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false},
            weekly_digest: {type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false},
            quiet_hours_start: {type: Sequelize.INTEGER, allowNull: true},
            quiet_hours_end: {type: Sequelize.INTEGER, allowNull: true},
            created_at: {type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW')},
            updated_at: {type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW')},
        });

        await addIndexIfMissing(queryInterface, 'notification_preferences', ['user_id', 'workspace_id'], {
            unique: true,
            name: 'notification_preferences_user_workspace_unique',
        });

        await createTableIfMissing(queryInterface, 'task_reads', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.literal('gen_random_uuid()'),
                primaryKey: true,
            },
            user_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {model: 'users', key: 'id'},
                onDelete: 'CASCADE',
            },
            task_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {model: 'tasks', key: 'id'},
                onDelete: 'CASCADE',
            },
            last_read_at: {type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW')},
            created_at: {type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW')},
            updated_at: {type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW')},
        });

        await addIndexIfMissing(queryInterface, 'task_reads', ['user_id', 'task_id'], {
            unique: true,
            name: 'task_reads_user_task_unique',
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('task_reads');
        await queryInterface.dropTable('notification_preferences');
        await removeColumnIfPresent(queryInterface, 'users', 'timezone');
    },
};
