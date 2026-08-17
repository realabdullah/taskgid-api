/**
 * Resolving a user's notification settings for a given event.
 */
import {Op} from 'sequelize';
import NotificationPreference from '../models/NotificationPreference.js';
import User from '../models/User.js';
import {NOTIFICATION_TYPES} from '../constants/notificationTypes.js';

/** What a user gets before they have expressed any preference. */
export const DEFAULT_PREFERENCES = {
    taskAssigned: true,
    taskUpdated: true,
    taskCompleted: true,
    commentCreated: true,
    commentLiked: false,
    mentioned: true,
    workspaceInvite: true,
    inAppEnabled: true,
    emailEnabled: true,
    dailyDigest: false,
    weeklyDigest: false,
    quietHoursStart: null,
    quietHoursEnd: null,
};

/** Maps a notification event onto the preference column that governs it. */
const EVENT_TO_FIELD = {
    [NOTIFICATION_TYPES.TASK_ASSIGNED]: 'taskAssigned',
    [NOTIFICATION_TYPES.TASK_UPDATED]: 'taskUpdated',
    [NOTIFICATION_TYPES.TASK_DELETED]: 'taskUpdated',
    [NOTIFICATION_TYPES.TASK_COMPLETED]: 'taskCompleted',
    [NOTIFICATION_TYPES.TASK_COMMENTED]: 'commentCreated',
    [NOTIFICATION_TYPES.COMMENT_CREATED]: 'commentCreated',
    [NOTIFICATION_TYPES.COMMENT_UPDATED]: 'commentCreated',
    [NOTIFICATION_TYPES.COMMENT_LIKED]: 'commentLiked',
    [NOTIFICATION_TYPES.USER_MENTIONED]: 'mentioned',
    [NOTIFICATION_TYPES.TASK_MENTIONED]: 'mentioned',
    [NOTIFICATION_TYPES.COMMENT_MENTIONED]: 'mentioned',
    [NOTIFICATION_TYPES.WORKSPACE_INVITE]: 'workspaceInvite',
};

/** Events a user has explicitly asked about are never held back by quiet hours. */
const BYPASSES_QUIET_HOURS = new Set([
    NOTIFICATION_TYPES.USER_MENTIONED,
    NOTIFICATION_TYPES.TASK_MENTIONED,
    NOTIFICATION_TYPES.COMMENT_MENTIONED,
]);

/**
 * Read a user's effective preferences, with any workspace override applied.
 * @param {string} userId - The user.
 * @param {string} [workspaceId] - Workspace whose override should win.
 * @return {Promise<Object>} The resolved preference object.
 */
export const resolvePreferences = async (userId, workspaceId = null) => {
    const rows = await NotificationPreference.findAll({
        where: {
            userId,
            workspaceId: workspaceId ? {[Op.or]: [workspaceId, null]} : null,
        },
    });

    const accountWide = rows.find((row) => row.workspaceId === null);
    const override = workspaceId ? rows.find((row) => row.workspaceId === workspaceId) : null;

    return {
        ...DEFAULT_PREFERENCES,
        ...(accountWide ? accountWide.toJSON() : {}),
        ...(override ? override.toJSON() : {}),
    };
};

/**
 * Whether the local time in a timezone falls inside quiet hours.
 * @param {Object} preferences - Resolved preferences.
 * @param {string} timezone - IANA timezone name.
 * @param {Date} [now] - Instant to test.
 * @return {boolean} True when notifications should be held.
 */
export const isWithinQuietHours = (preferences, timezone, now = new Date()) => {
    const {quietHoursStart, quietHoursEnd} = preferences;
    if (quietHoursStart === null || quietHoursEnd === null) return false;
    if (quietHoursStart === quietHoursEnd) return false;

    let localMinutes;
    try {
        const parts = new Intl.DateTimeFormat('en-GB', {
            timeZone: timezone || 'UTC',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).formatToParts(now);
        const hour = Number(parts.find((part) => part.type === 'hour').value);
        const minute = Number(parts.find((part) => part.type === 'minute').value);
        localMinutes = hour * 60 + minute;
    } catch {
        // An unknown timezone must not silence someone's notifications.
        return false;
    }

    // A window that wraps past midnight is inside-or-after start, or before end.
    return quietHoursStart < quietHoursEnd ?
        localMinutes >= quietHoursStart && localMinutes < quietHoursEnd :
        localMinutes >= quietHoursStart || localMinutes < quietHoursEnd;
};

/**
 * Decide whether an event may be delivered to a user right now.
 * @param {string} userId - Recipient.
 * @param {string} event - Notification event type.
 * @param {Object} [options] - Resolution options.
 * @param {string} [options.workspaceId] - Workspace the event belongs to.
 * @return {Promise<{inApp: boolean, email: boolean}>} Allowed channels.
 */
export const resolveDelivery = async (userId, event, {workspaceId = null} = {}) => {
    const preferences = await resolvePreferences(userId, workspaceId);

    const field = EVENT_TO_FIELD[event];
    // An event with no mapping is something the user has never been offered a
    // switch for, so it is delivered rather than silently dropped.
    if (field && preferences[field] === false) return {inApp: false, email: false};

    if (!BYPASSES_QUIET_HOURS.has(event)) {
        const user = await User.findByPk(userId, {attributes: ['timezone']});
        if (isWithinQuietHours(preferences, user?.timezone)) {
            // Quiet hours suppress the interruption, not the record: the item
            // still appears in the in-app inbox, it just does not email.
            return {inApp: preferences.inAppEnabled, email: false};
        }
    }

    return {inApp: preferences.inAppEnabled, email: preferences.emailEnabled};
};
