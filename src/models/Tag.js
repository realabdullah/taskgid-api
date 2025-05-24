import {DataTypes} from 'sequelize';
import sequelize from '../config/database.js';

const Tag = sequelize.define('Tag', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
            notEmpty: true,
            len: [1, 50],
        },
    },
    color: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
            is: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
        },
        defaultValue: '#3b82f6', // Default blue color
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    workspaceId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'workspaces',
            key: 'id',
        },
        onDelete: 'CASCADE',
    },
    createdById: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id',
        },
    },
}, {
    tableName: 'tags',
    timestamps: true,
    indexes: [
        {
            unique: true,
            fields: ['name', 'workspaceId'],
            name: 'unique_tag_per_workspace',
        },
        {
            fields: ['workspaceId'],
        },
        {
            fields: ['createdById'],
        },
    ],
});

export default Tag;
