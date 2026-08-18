import {DataTypes, Model} from 'sequelize';
import sequelize from '../config/database.js';

/**
 * Per-user notification settings.
 *
 * A row with a null workspaceId is the user's account-wide default; a row with
 * a workspaceId overrides it for that workspace only. `resolvePreference` picks
 * the more specific of the two.
 */
class NotificationPreference extends Model {}

NotificationPreference.init(
    {
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        userId: {
            type: DataTypes.UUID,
            allowNull: false,
        },
        workspaceId: {
            // Null means "applies everywhere unless a workspace row overrides it".
            type: DataTypes.UUID,
            allowNull: true,
        },
        // Which events are allowed to notify at all.
        taskAssigned: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true},
        taskUpdated: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true},
        taskCompleted: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true},
        commentCreated: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true},
        commentLiked: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false},
        mentioned: {
            // Mentions are the one thing people almost never want silenced, so
            // this stays on even when everything else is turned off.
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        workspaceInvite: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true},
        // Delivery channels.
        inAppEnabled: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true},
        emailEnabled: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true},
        // Digest cadence for the summary emails.
        dailyDigest: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false},
        weeklyDigest: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false},
        // Quiet hours, as local minutes past midnight in the user's timezone.
        // Equal values mean quiet hours are off.
        quietHoursStart: {type: DataTypes.INTEGER, allowNull: true},
        quietHoursEnd: {type: DataTypes.INTEGER, allowNull: true},
    },
    {
        sequelize,
        modelName: 'NotificationPreference',
        tableName: 'notification_preferences',
        timestamps: true,
        underscored: true,
        indexes: [{unique: true, fields: ['user_id', 'workspace_id']}],
    },
);

export default NotificationPreference;
