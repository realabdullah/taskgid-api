import {DataTypes, Model} from 'sequelize';
import sequelize from '../config/database.js';

/** One attempt-set at delivering one event to one endpoint, retried in place rather than re-rowed. */
class WebhookDelivery extends Model {}

WebhookDelivery.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        webhookEndpointId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {model: 'webhook_endpoints', key: 'id'},
        },
        workspaceEventId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {model: 'workspace_events', key: 'id'},
        },
        status: {
            // eslint-disable-next-line new-cap
            type: DataTypes.ENUM('pending', 'succeeded', 'failed'),
            allowNull: false,
            defaultValue: 'pending',
        },
        attemptCount: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        nextAttemptAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        lastStatusCode: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        lastError: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        lastAttemptedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        sequelize,
        modelName: 'WebhookDelivery',
        tableName: 'webhook_deliveries',
        timestamps: true,
        updatedAt: false,
    },
);

export default WebhookDelivery;
