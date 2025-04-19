import {DataTypes, Model} from 'sequelize';
import sequelize from '../config/database.js';
import {User} from './User.js';

/**
 * Session model representing user authentication sessions
 * @extends Model
 */
class Session extends Model {}

// Define the model
Session.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        token: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        expiresAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        deviceInfo: {
            type: DataTypes.JSONB,
            allowNull: true,
        },
        ipAddress: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id',
            },
            field: 'user_id',
        },
    },
    {
        sequelize,
        modelName: 'Session',
        tableName: 'sessions',
        indexes: [
            {
                fields: ['token'],
                unique: true,
            },
            {
                fields: ['user_id'],
            },
            {
                fields: ['expires_at'],
            },
        ],
    },
);

// Define associations
Session.belongsTo(User, {foreignKey: 'userId', as: 'user'});
User.hasMany(Session, {foreignKey: 'userId', as: 'sessions'});

export default Session;
