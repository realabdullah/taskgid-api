import {DataTypes, Model} from 'sequelize';
import sequelize from '../config/database.js';

/** A persisted, replayable record of a domain event — the source webhook deliveries are built from. */
class WorkspaceEvent extends Model {}

WorkspaceEvent.init(
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
        type: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        actorId: {
            type: DataTypes.UUID,
            allowNull: true,
            references: {model: 'users', key: 'id'},
        },
        payload: {
            type: DataTypes.JSONB,
            allowNull: false,
            defaultValue: {},
        },
    },
    {
        sequelize,
        modelName: 'WorkspaceEvent',
        tableName: 'workspace_events',
        timestamps: true,
        updatedAt: false,
    },
);

export default WorkspaceEvent;
