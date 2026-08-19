'use strict';

const {createTableIfMissing, addIndexIfMissing} = require('../scripts/migration-helpers.cjs');

module.exports = {
    async up(queryInterface, Sequelize) {
        await createTableIfMissing(queryInterface, 'slack_installations', {
            id: {type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true},
            workspace_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {model: 'workspaces', key: 'id'},
                onDelete: 'CASCADE',
            },
            team_id: {type: Sequelize.STRING, allowNull: false},
            team_name: {type: Sequelize.STRING, allowNull: true},
            // Retrievable: every chat.postMessage call needs it. Never returned
            // by the management API.
            bot_token: {type: Sequelize.STRING, allowNull: false},
            bot_user_id: {type: Sequelize.STRING, allowNull: true},
            channel_id: {type: Sequelize.STRING, allowNull: true},
            channel_name: {type: Sequelize.STRING, allowNull: true},
            event_types: {type: Sequelize.JSONB, allowNull: false, defaultValue: []},
            is_active: {type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true},
            installed_by_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {model: 'users', key: 'id'},
            },
            created_at: {type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW},
            updated_at: {type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW},
        });
        await addIndexIfMissing(queryInterface, 'slack_installations', ['workspace_id'], {
            name: 'slack_installations_workspace_id_uidx',
            unique: true,
        });
        await addIndexIfMissing(queryInterface, 'slack_installations', ['team_id'], {
            name: 'slack_installations_team_id_idx',
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('slack_installations');
    },
};
