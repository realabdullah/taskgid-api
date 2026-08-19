import {DataTypes, Model} from 'sequelize';
import sequelize from '../config/database.js';

/** Which workspace events a Slack channel may receive by default. */
export const DEFAULT_SLACK_EVENT_TYPES = [
    'task.created',
    'task.updated',
    'task.deleted',
    'comment.created',
];

/** A Slack workspace connected to one Taskgid workspace. */
class SlackInstallation extends Model {
    /**
     * Strips the bot token so it is never serialised by accident.
     * @return {Object} The plain representation, without `botToken`.
     */
    toJSON() {
        const values = {...this.get()};
        delete values.botToken;
        return values;
    }
}

SlackInstallation.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        workspaceId: {
            type: DataTypes.UUID,
            allowNull: false,
            unique: true,
            references: {model: 'workspaces', key: 'id'},
        },
        teamId: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        teamName: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        botToken: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        botUserId: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        channelId: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        channelName: {
            type: DataTypes.STRING,
            allowNull: true,
        },
        eventTypes: {
            type: DataTypes.JSONB,
            allowNull: false,
            defaultValue: DEFAULT_SLACK_EVENT_TYPES,
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        installedById: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {model: 'users', key: 'id'},
        },
    },
    {
        sequelize,
        modelName: 'SlackInstallation',
        tableName: 'slack_installations',
        timestamps: true,
    },
);

export default SlackInstallation;
