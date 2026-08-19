'use strict';

const {createTableIfMissing, addIndexIfMissing} = require('../scripts/migration-helpers.cjs');

module.exports = {
    async up(queryInterface, Sequelize) {
        await createTableIfMissing(queryInterface, 'api_keys', {
            id: {type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true},
            workspace_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {model: 'workspaces', key: 'id'},
                onDelete: 'CASCADE',
            },
            user_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {model: 'users', key: 'id'},
                onDelete: 'CASCADE',
            },
            name: {type: Sequelize.STRING, allowNull: false},
            // Hashed: the server only ever verifies a presented key, unlike a
            // webhook secret it must reuse to sign something.
            key_hash: {type: Sequelize.STRING, allowNull: false, unique: true},
            // Not secret — enough of the raw key to tell two keys apart in a
            // list without ever showing the whole thing again.
            key_preview: {type: Sequelize.STRING, allowNull: false},
            last_used_at: {type: Sequelize.DATE, allowNull: true},
            revoked_at: {type: Sequelize.DATE, allowNull: true},
            created_at: {type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW},
            updated_at: {type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW},
        });
        await addIndexIfMissing(queryInterface, 'api_keys', ['workspace_id'], {
            name: 'api_keys_workspace_id_idx',
        });
        await addIndexIfMissing(queryInterface, 'api_keys', ['user_id'], {
            name: 'api_keys_user_id_idx',
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('api_keys');
    },
};
