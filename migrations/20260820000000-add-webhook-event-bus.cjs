'use strict';

const {createTableIfMissing, addIndexIfMissing} = require('../scripts/migration-helpers.cjs');

module.exports = {
    async up(queryInterface, Sequelize) {
        await createTableIfMissing(queryInterface, 'workspace_events', {
            id: {type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true},
            workspace_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {model: 'workspaces', key: 'id'},
                onDelete: 'CASCADE',
            },
            type: {type: Sequelize.STRING, allowNull: false},
            actor_id: {
                type: Sequelize.UUID,
                allowNull: true,
                references: {model: 'users', key: 'id'},
                onDelete: 'SET NULL',
            },
            payload: {type: Sequelize.JSONB, allowNull: false, defaultValue: {}},
            created_at: {type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW},
        });
        await addIndexIfMissing(queryInterface, 'workspace_events', ['workspace_id', 'created_at'], {
            name: 'workspace_events_workspace_id_created_at_idx',
        });

        await createTableIfMissing(queryInterface, 'webhook_endpoints', {
            id: {type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true},
            workspace_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {model: 'workspaces', key: 'id'},
                onDelete: 'CASCADE',
            },
            url: {type: Sequelize.STRING, allowNull: false},
            description: {type: Sequelize.STRING, allowNull: true},
            // Retrievable, not hashed: the server must reuse it to sign every
            // future delivery, unlike a credential it only ever verifies.
            secret: {type: Sequelize.STRING, allowNull: false},
            event_types: {type: Sequelize.JSONB, allowNull: false, defaultValue: []},
            is_active: {type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true},
            last_used_at: {type: Sequelize.DATE, allowNull: true},
            created_by_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {model: 'users', key: 'id'},
            },
            created_at: {type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW},
            updated_at: {type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW},
        });
        await addIndexIfMissing(queryInterface, 'webhook_endpoints', ['workspace_id'], {
            name: 'webhook_endpoints_workspace_id_idx',
        });

        await createTableIfMissing(queryInterface, 'webhook_deliveries', {
            id: {type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true},
            webhook_endpoint_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {model: 'webhook_endpoints', key: 'id'},
                onDelete: 'CASCADE',
            },
            workspace_event_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: {model: 'workspace_events', key: 'id'},
                onDelete: 'CASCADE',
            },
            // eslint-disable-next-line new-cap
            status: {type: Sequelize.ENUM('pending', 'succeeded', 'failed'), allowNull: false, defaultValue: 'pending'},
            attempt_count: {type: Sequelize.INTEGER, allowNull: false, defaultValue: 0},
            next_attempt_at: {type: Sequelize.DATE, allowNull: true},
            last_status_code: {type: Sequelize.INTEGER, allowNull: true},
            last_error: {type: Sequelize.TEXT, allowNull: true},
            last_attempted_at: {type: Sequelize.DATE, allowNull: true},
            created_at: {type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW},
        });
        await addIndexIfMissing(queryInterface, 'webhook_deliveries', ['status', 'next_attempt_at'], {
            name: 'webhook_deliveries_status_next_attempt_at_idx',
        });
        await addIndexIfMissing(queryInterface, 'webhook_deliveries', ['webhook_endpoint_id'], {
            name: 'webhook_deliveries_webhook_endpoint_id_idx',
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('webhook_deliveries');
        await queryInterface.dropTable('webhook_endpoints');
        await queryInterface.dropTable('workspace_events');
        await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_webhook_deliveries_status";');
    },
};
