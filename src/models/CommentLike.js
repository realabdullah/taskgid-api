import {DataTypes} from 'sequelize';
import sequelize from '../config/database.js';
import Comment from './Comment.js';
import User from './User.js';

const CommentLike = sequelize.define('CommentLike', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    commentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'comments',
            key: 'id',
        },
        field: 'comment_id',
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
}, {
    tableName: 'comment_likes',
    timestamps: true,
    indexes: [
        {
            unique: true,
            fields: ['comment_id', 'user_id'],
        },
    ],
});

// Define associations
CommentLike.belongsTo(Comment, {foreignKey: 'commentId', as: 'comment'});
CommentLike.belongsTo(User, {foreignKey: 'userId', as: 'user'});

export default CommentLike;
