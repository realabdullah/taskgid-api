import {DataTypes, Model} from 'sequelize';
import crypto from 'crypto';
import sequelize from '../config/database.js';

/**
 * An access/refresh token pair issued for an MCP client acting as a user
 * inside one workspace. Access tokens are bearer credentials on `/mcp`.
 */
class McpOAuthToken extends Model {
    /**
     * Hashes a raw token for storage/lookup.
     * @param {string} raw - Presented token.
     * @return {string} Hex SHA-256 digest.
     */
    static hash(raw) {
        return crypto.createHash('sha256').update(raw).digest('hex');
    }

    /**
     * Finds a non-revoked access token that has not yet expired.
     * @param {string} raw - Presented access token.
     * @return {Promise<McpOAuthToken|null>} Matching row, or null.
     */
    static async findActiveAccessToken(raw) {
        if (!raw) return null;
        const row = await this.findOne({
            where: {accessTokenHash: this.hash(raw), revokedAt: null},
        });
        if (!row) return null;
        if (row.accessExpiresAt.getTime() <= Date.now()) return null;
        return row;
    }

    /**
     * Finds a non-revoked refresh token that has not yet expired.
     * @param {string} raw - Presented refresh token.
     * @return {Promise<McpOAuthToken|null>} Matching row, or null.
     */
    static async findActiveRefreshToken(raw) {
        if (!raw) return null;
        const row = await this.findOne({
            where: {refreshTokenHash: this.hash(raw), revokedAt: null},
        });
        if (!row) return null;
        if (row.refreshExpiresAt && row.refreshExpiresAt.getTime() <= Date.now()) return null;
        return row;
    }
}

McpOAuthToken.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        accessTokenHash: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            field: 'access_token_hash',
        },
        refreshTokenHash: {
            type: DataTypes.STRING,
            allowNull: true,
            unique: true,
            field: 'refresh_token_hash',
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
        accessExpiresAt: {
            type: DataTypes.DATE,
            allowNull: false,
            field: 'access_expires_at',
        },
        refreshExpiresAt: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'refresh_expires_at',
        },
        revokedAt: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'revoked_at',
        },
    },
    {
        sequelize,
        modelName: 'McpOAuthToken',
        tableName: 'mcp_oauth_tokens',
        timestamps: true,
        underscored: true,
    },
);

export default McpOAuthToken;
