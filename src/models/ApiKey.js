import {DataTypes, Model} from 'sequelize';
import crypto from 'crypto';
import sequelize from '../config/database.js';

/** Marks a credential as an API key rather than a session JWT, without parsing it. */
export const API_KEY_PREFIX = 'tg_key_';

/** A long-lived credential authenticating as its issuer, scoped to one workspace. */
class ApiKey extends Model {
    /**
     * Generates a new raw key and stores its hash and preview, replacing any
     * previous key material on this row.
     * @return {string} The raw key. It is never recoverable after this call returns.
     */
    generateKey() {
        const raw = `${API_KEY_PREFIX}${crypto.randomBytes(24).toString('base64url')}`;
        this.keyHash = ApiKey.hash(raw);
        this.keyPreview = `${raw.slice(0, API_KEY_PREFIX.length + 4)}…${raw.slice(-4)}`;
        return raw;
    }

    /**
     * Hashes a raw key the same way a stored one is hashed, for lookup.
     * @param {string} raw - A presented key.
     * @return {string} The hex-encoded SHA-256 hash.
     */
    static hash(raw) {
        return crypto.createHash('sha256').update(raw).digest('hex');
    }

    /**
     * Finds the active (non-revoked) key matching a raw presented value.
     * @param {string} raw - A presented key.
     * @return {Promise<ApiKey|null>} The matching key, or null.
     */
    static async findActiveByRawKey(raw) {
        if (!raw || !raw.startsWith(API_KEY_PREFIX)) return null;
        return this.findOne({where: {keyHash: ApiKey.hash(raw), revokedAt: null}});
    }

    /**
     * Strips the hash so it is never serialised by accident.
     * @return {Object} The plain representation, without `keyHash`.
     */
    toJSON() {
        const values = {...this.get()};
        delete values.keyHash;
        return values;
    }
}

ApiKey.init(
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
        userId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {model: 'users', key: 'id'},
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        keyHash: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        keyPreview: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        lastUsedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        revokedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        sequelize,
        modelName: 'ApiKey',
        tableName: 'api_keys',
        timestamps: true,
    },
);

export default ApiKey;
