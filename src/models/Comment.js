import {DataTypes} from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Comment model representing task comments
 * @extends Model
 */
const Comment = sequelize.define('Comment', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    taskId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'tasks',
            key: 'id',
        },
    },
    userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id',
        },
    },
    parentId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'comments',
            key: 'id',
        },
    },
    mentions: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: [],
    },
    likeCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
}, {
    tableName: 'comments',
    timestamps: true,
});

export default Comment;
