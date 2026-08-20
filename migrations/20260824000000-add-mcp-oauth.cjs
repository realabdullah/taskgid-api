'use strict';

const {createTableIfMissing, addIndexIfMissing} = require('../scripts/migration-helpers.cjs');

module.exports = {
    async up(queryInterface, Sequelize) {
        await createTableIfMissing(queryInterface, 'mcp_oauth_clients', {
            id: {type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true},
            client_id: {type: Sequelize.STRING, allowNull: false, unique: true},
            client_secret_hash: {type: Sequelize.STRING, allowNull: true},
            client_id_issued_at: {type: Sequelize.INTEGER, allowNull: false},
            client_secret_expires_at: {type: Sequelize.INTEGER, allowNull: true},
            // Full OAuth client metadata (redirect_uris, grant_types, …) as JSON.
            metadata: {type: Sequelize.JSONB, allowNull: false},
            created_at: {type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW},
            updated_at: {type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW},
        });

        await createTableIfMissing(queryInterface, 'mcp_oauth_codes', {
            id: {type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true},
            code_hash: {type: Sequelize.STRING, allowNull: false, unique: true},
            client_id: {type: Sequelize.STRING, allowNull: false},
            user_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {model: 'users', key: 'id'},
                onDelete: 'CASCADE',
            },
            workspace_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {model: 'workspaces', key: 'id'},
                onDelete: 'CASCADE',
            },
            redirect_uri: {type: Sequelize.TEXT, allowNull: false},
            code_challenge: {type: Sequelize.STRING, allowNull: false},
            scopes: {type: Sequelize.ARRAY(Sequelize.STRING), allowNull: false, defaultValue: []},
            resource: {type: Sequelize.TEXT, allowNull: true},
            expires_at: {type: Sequelize.DATE, allowNull: false},
            created_at: {type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW},
            updated_at: {type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW},
        });
        await addIndexIfMissing(queryInterface, 'mcp_oauth_codes', ['expires_at'], {
            name: 'mcp_oauth_codes_expires_at_idx',
        });

        await createTableIfMissing(queryInterface, 'mcp_oauth_tokens', {
            id: {type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true},
            access_token_hash: {type: Sequelize.STRING, allowNull: false, unique: true},
            refresh_token_hash: {type: Sequelize.STRING, allowNull: true, unique: true},
            client_id: {type: Sequelize.STRING, allowNull: false},
            user_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {model: 'users', key: 'id'},
                onDelete: 'CASCADE',
            },
            workspace_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {model: 'workspaces', key: 'id'},
                onDelete: 'CASCADE',
            },
            scopes: {type: Sequelize.ARRAY(Sequelize.STRING), allowNull: false, defaultValue: []},
            resource: {type: Sequelize.TEXT, allowNull: true},
            access_expires_at: {type: Sequelize.DATE, allowNull: false},
            refresh_expires_at: {type: Sequelize.DATE, allowNull: true},
            revoked_at: {type: Sequelize.DATE, allowNull: true},
            created_at: {type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW},
            updated_at: {type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW},
        });
        await addIndexIfMissing(queryInterface, 'mcp_oauth_tokens', ['user_id'], {
            name: 'mcp_oauth_tokens_user_id_idx',
        });
        await addIndexIfMissing(queryInterface, 'mcp_oauth_tokens', ['workspace_id'], {
            name: 'mcp_oauth_tokens_workspace_id_idx',
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('mcp_oauth_tokens');
        await queryInterface.dropTable('mcp_oauth_codes');
        await queryInterface.dropTable('mcp_oauth_clients');
    },
};
