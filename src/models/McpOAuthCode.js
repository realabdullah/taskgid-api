import {DataTypes, Model} from 'sequelize';
import crypto from 'crypto';
import sequelize from '../config/database.js';

/** Short-lived authorization code issued after the user consents. */
class McpOAuthCode extends Model {
    /**
     * Hashes a raw authorization code for storage/lookup.
     * @param {string} raw - Presented code.
     * @return {string} Hex SHA-256 digest.
     */
    static hash(raw) {
        return crypto.createHash('sha256').update(raw).digest('hex');
    }

    /**
     * Finds a still-valid code by its raw value.
     * @param {string} raw - Presented code.
     * @return {Promise<McpOAuthCode|null>} Matching unexpired row, or null.
     */
    static async findActiveByRaw(raw) {
        if (!raw) return null;
        const row = await this.findOne({where: {codeHash: this.hash(raw)}});
        if (!row) return null;
        if (row.expiresAt.getTime() <= Date.now()) {
            await row.destroy().catch(() => {});
            return null;
        }
        return row;
    }
}

McpOAuthCode.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        codeHash: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            field: 'code_hash',
        },
        clientId: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'client_id',
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: false,
            field: 'user_id',
        },
        workspaceId: {
            type: DataTypes.UUID,
            allowNull: false,
            field: 'workspace_id',
        },
        redirectUri: {
            type: DataTypes.TEXT,
            allowNull: false,
            field: 'redirect_uri',
        },
        codeChallenge: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'code_challenge',
        },
        scopes: {
            // eslint-disable-next-line new-cap
            type: DataTypes.ARRAY(DataTypes.STRING),
            allowNull: false,
            defaultValue: [],
        },
        resource: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        expiresAt: {
            type: DataTypes.DATE,
            allowNull: false,
            field: 'expires_at',
        },
    },
    {
        sequelize,
        modelName: 'McpOAuthCode',
        tableName: 'mcp_oauth_codes',
        timestamps: true,
        underscored: true,
    },
);

export default McpOAuthCode;
