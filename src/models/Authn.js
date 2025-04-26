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
            type: DataTypes.STRING,
            allowNull: false,
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
            references: {
                model: 'users',
                key: 'id',
            },
        },
    },
    {
        sequelize,
        modelName: 'Authn',
        tableName: 'authns',
    },
);

export default Authn;
