import {DataTypes, Model} from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Authn model representing WebAuthn credentials
 * @extends Model
 */
class Authn extends Model {
    /**
     * Convert authn instance to JSON, excluding sensitive fields
     * @return {Object} JSON representation of the authn credential
     */
    toJSON() {
        const values = {...this.get()};
        delete values.credentialID;
        delete values.credentialPublicKey;
        delete values.counter;
        delete values.transports;
        delete values.userId;
        return values;
    }
}

// Define the model
Authn.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        device: {
            type: DataTypes.JSONB,
            allowNull: true,
            defaultValue: {
                type: null,
                vendor: null,
                model: null,
            },
            validate: {
                isDeviceObject(value) {
                    if (
                        typeof value !== 'object' ||
                    !('type' in value) ||
                    !('vendor' in value) ||
                    !('model' in value)
                    ) {
                        throw new Error('Device must be an object with type, vendor, and model.');
                    }
                },
            },
        },
        credentialID: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        credentialPublicKey: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        counter: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        transports: {
            type: DataTypes.JSONB,
            allowNull: true,
            defaultValue: ['internal'],
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: false,
            field: 'user_id',
            references: {
                model: 'users',
                key: 'id',
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
        },
    },
    {
        sequelize,
        modelName: 'Authn',
        tableName: 'authns',
        timestamps: true,
        indexes: [
            {
                fields: ['user_id'],
            },
        ],
    },
);

export default Authn;
