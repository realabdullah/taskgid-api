import {DataTypes, Model} from 'sequelize';
import crypto from 'crypto';
import sequelize from '../config/database.js';

/** A URL a workspace has asked to receive domain events at. */
class WebhookEndpoint extends Model {
    /**
     * Generates a new signing secret, replacing any existing one.
     * @return {string} The raw secret.
     */
    rotateSecret() {
        this.secret = `whsec_${crypto.randomBytes(24).toString('base64url')}`;
        return this.secret;
    }

    /**
     * Computes the HMAC-SHA256 signature Taskgid sends with every delivery.
     * @param {string} timestamp - Unix seconds, included in the signed string
     *   so a captured payload cannot be replayed indefinitely.
     * @param {string} body - The raw JSON body being sent.
     * @return {string} The hex-encoded signature.
     */
    sign(timestamp, body) {
        return crypto.createHmac('sha256', this.secret).update(`${timestamp}.${body}`).digest('hex');
    }

    /**
     * Strips the secret so it is never serialised by accident. A caller that
     * genuinely needs it — creation, rotation — reads `.secret` directly.
     * @return {Object} The plain representation, without `secret`.
     */
    toJSON() {
        const values = {...this.get()};
        delete values.secret;
        return values;
    }
}

WebhookEndpoint.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        workspaceId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {model: 'workspaces', key: 'id'},
        },
        url: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        description: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        secret: {
            // Retrievable, not hashed: the server signs every future delivery
            // with it, unlike a credential it only ever verifies.
            type: DataTypes.STRING,
            allowNull: false,
        },
        eventTypes: {
            type: DataTypes.JSONB,
            allowNull: false,
            defaultValue: [],
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        lastUsedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        createdById: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {model: 'users', key: 'id'},
        },
    },
    {
        sequelize,
        modelName: 'WebhookEndpoint',
        tableName: 'webhook_endpoints',
        timestamps: true,
    },
);

export default WebhookEndpoint;
