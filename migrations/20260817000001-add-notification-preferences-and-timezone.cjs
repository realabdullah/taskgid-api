'use strict';

/**
 * Phase 3: per-user notification preferences and a timezone on the user, so
 * "overdue", "today" and digest send times mean the same thing everywhere.
 */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('users', 'timezone', {
            type: Sequelize.STRING,
            allowNull: true,
            defaultValue: 'UTC',
        });

        await queryInterface.createTable('notification_preferences', {
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

        await queryInterface.addIndex('notification_preferences', ['user_id', 'workspace_id'], {
            unique: true,
            name: 'notification_preferences_user_workspace_unique',
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('notification_preferences');
        await queryInterface.removeColumn('users', 'timezone');
    },
};
