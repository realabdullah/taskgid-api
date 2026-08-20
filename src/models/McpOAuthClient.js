import {DataTypes, Model} from 'sequelize';
import crypto from 'crypto';
import sequelize from '../config/database.js';

/**
 * Derives a 32-byte AES key from JWT_SECRET. The MCP SDK compares client
 * secrets in plaintext on the token endpoint, so confidential-client secrets
 * must be recoverable — encrypted at rest, not merely hashed.
 * @return {Buffer} 32-byte key.
 */
const secretKey = () => crypto.createHash('sha256')
    .update(process.env.JWT_SECRET || 'dev')
    .digest();

/**
 * An OAuth client registered against the MCP authorization server, typically
 * via Dynamic Client Registration (RFC 7591). Claude.ai, Cursor, and similar
 * agents register themselves here the first time a user connects.
 */
class McpOAuthClient extends Model {
    /**
     * Encrypts a client secret for storage.
     * @param {string} raw - Presented secret.
     * @return {string} iv:ciphertext:tag, base64url segments.
     */
    static sealSecret(raw) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
        const enc = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return [iv, enc, tag].map((b) => b.toString('base64url')).join(':');
    }

    /**
     * Decrypts a sealed client secret.
     * @param {string} sealed - Value from sealSecret.
     * @return {string|null} Raw secret, or null when missing/invalid.
     */
    static openSecret(sealed) {
        if (!sealed) return null;
        try {
            const [ivB, encB, tagB] = sealed.split(':');
            const decipher = crypto.createDecipheriv(
                'aes-256-gcm',
                secretKey(),
                Buffer.from(ivB, 'base64url'),
            );
            decipher.setAuthTag(Buffer.from(tagB, 'base64url'));
            return Buffer.concat([
                decipher.update(Buffer.from(encB, 'base64url')),
                decipher.final(),
            ]).toString('utf8');
        } catch {
            return null;
        }
    }

    /**
     * Looks up a client by its public client_id.
     * @param {string} clientId - Public identifier.
     * @return {Promise<McpOAuthClient|null>} Matching row, or null.
     */
    static async findByClientId(clientId) {
        if (!clientId) return null;
        return this.findOne({where: {clientId}});
    }

    /**
     * Shape expected by the MCP SDK's OAuthRegisteredClientsStore. Includes the
     * raw client_secret when present so token-endpoint client auth can compare.
     * @return {Object} Full client information document.
     */
    toClientInformation() {
        const meta = this.metadata || {};
        const clientSecret = McpOAuthClient.openSecret(this.clientSecretHash);
        return {
            ...meta,
            client_id: this.clientId,
            client_id_issued_at: this.clientIdIssuedAt,
            client_secret_expires_at: this.clientSecretExpiresAt ?? undefined,
            ...(clientSecret ? {client_secret: clientSecret} : {}),
        };
    }
}

McpOAuthClient.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        clientId: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            field: 'client_id',
        },
        clientSecretHash: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'client_secret_hash',
        },
        clientIdIssuedAt: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'client_id_issued_at',
        },
        clientSecretExpiresAt: {
            type: DataTypes.INTEGER,
            allowNull: true,
            field: 'client_secret_expires_at',
        },
        metadata: {
            type: DataTypes.JSONB,
            allowNull: false,
        },
    },
    {
        sequelize,
        modelName: 'McpOAuthClient',
        tableName: 'mcp_oauth_clients',
        timestamps: true,
        underscored: true,
    },
);

export default McpOAuthClient;
