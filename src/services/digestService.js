/**
 * Daily and weekly digest emails.
 *
 * Two rules govern every send: the recipient must have opted in (Phase 3.2
 * preferences), and "today" is decided in their own timezone (Phase 3.3), not
 * the server's. A digest that arrives at 3am or lists yesterday's work as due
 * today is worse than no digest at all.
 */
import {Op} from 'sequelize';
import Task from '../models/Task.js';
import User from '../models/User.js';
import {Workspace} from '../models/Workspace.js';
import NotificationPreference from '../models/NotificationPreference.js';
import emailService from '../utils/emailService.js';

const BODY_STYLE = [
    'font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif',
    'color:#111',
    'max-width:560px',
    'margin:0 auto',
    'padding:24px',
].join(';');

/** Local hour at which a digest is considered due. */
export const DIGEST_HOUR = 8;

/** Weekly digests go out on this weekday, in the recipient's timezone. */
export const WEEKLY_DIGEST_WEEKDAY = 'Mon';

/**
 * The recipient's local wall-clock parts for an instant.
 * @param {Date} at - The instant.
 * @param {string} timezone - IANA timezone name.
 * @return {{hour: number, weekday: string, dateKey: string}} Local parts.
 */
export const localParts = (at, timezone) => {
    const zone = timezone || 'UTC';
    try {
        const parts = new Intl.DateTimeFormat('en-GB', {
            timeZone: zone,
            hour: '2-digit',
            hour12: false,
            weekday: 'short',
        }).formatToParts(at);
        const hour = Number(parts.find((part) => part.type === 'hour').value);
        const weekday = parts.find((part) => part.type === 'weekday').value;
        const dateKey = new Intl.DateTimeFormat('en-CA', {
            timeZone: zone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(at);
        return {hour, weekday, dateKey};
    } catch {
        return {hour: at.getUTCHours(), weekday: 'Mon', dateKey: at.toISOString().slice(0, 10)};
    }
};

/**
 * Everything open and assigned to a user, for building a digest.
 * @param {string} userId - The recipient.
 * @return {Promise<Array<Object>>} Task rows with their workspace.
 */
const openTasksFor = async (userId) => {
    return Task.findAll({
        where: {status: {[Op.in]: ['todo', 'in_progress']}},
        include: [
            {
                model: User,
                as: 'assignees',
                attributes: ['id'],
                through: {attributes: []},
                where: {id: userId},
                required: true,
            },
            {model: Workspace, as: 'workspace', attributes: ['title', 'slug'], required: false},
        ],
        order: [['dueDate', 'ASC']],
        limit: 100,
    });
};

/**
 * Split a user's open tasks into the buckets a digest talks about.
 * @param {Array<Object>} tasks - Open tasks.
 * @param {string} timezone - Recipient's timezone.
 * @param {Date} now - Instant the digest is built for.
 * @return {{overdue: Array, today: Array, upcoming: Array}} Grouped tasks.
 */
export const groupForDigest = (tasks, timezone, now = new Date()) => {
    const {dateKey: today} = localParts(now, timezone);
    const overdue = [];
    const dueToday = [];
    const upcoming = [];

    for (const task of tasks) {
        if (!task.dueDate) continue;
        const {dateKey} = localParts(new Date(task.dueDate), timezone);
        if (dateKey < today) overdue.push(task);
        else if (dateKey === today) dueToday.push(task);
        else upcoming.push(task);
    }

    return {overdue, today: dueToday, upcoming: upcoming.slice(0, 10)};
};

/**
 * Renders one digest section.
 * @param {string} heading - Section title.
 * @param {Array<Object>} tasks - Tasks to list.
 * @param {string} appUrl - Frontend base URL.
 * @return {string} HTML, or an empty string when there is nothing to say.
 */
const renderSection = (heading, tasks, appUrl) => {
    if (tasks.length === 0) return '';
    const items = tasks
        .map((task) => {
            const workspace = task.workspace?.title ? ` — ${task.workspace.title}` : '';
            const href = task.workspace?.slug ?
                `${appUrl}/app/workspaces/${task.workspace.slug}/tasks?taskId=${task.id}` :
                appUrl;
            const link = `<a href="${href}" style="color:#111;text-decoration:underline">${escapeHtml(task.title)}</a>`;
            const suffix = `<span style="color:#666">${escapeHtml(workspace)}</span>`;
            return `<li style="margin:0 0 8px 0">${link}${suffix}</li>`;
        })
        .join('');
    const title = `<h2 style="font-size:15px;margin:24px 0 8px 0">${heading} (${tasks.length})</h2>`;
    return `${title}<ul style="padding-left:18px;margin:0">${items}</ul>`;
};

/**
 * Escapes text for interpolation into the email body.
 * @param {string} value - Raw text.
 * @return {string} Escaped text.
 */
const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

/**
 * Builds a digest email for a user.
 * @param {Object} user - Recipient.
 * @param {string} cadence - 'daily' or 'weekly'.
 * @param {Date} now - Instant to build for.
 * @return {Promise<{subject: string, html: string, taskCount: number}|null>} The
 *   email, or null when there is nothing worth sending.
 */
export const buildDigest = async (user, cadence, now = new Date()) => {
    const tasks = await openTasksFor(user.id);
    const groups = groupForDigest(tasks, user.timezone, now);
    const taskCount = groups.overdue.length + groups.today.length + groups.upcoming.length;

    // An empty digest is just noise; nothing is sent.
    if (taskCount === 0) return null;

    const appUrl = process.env.FRONTEND_URL || 'https://tasks.abdspace.xyz';
    const title = cadence === 'weekly' ? 'Your week' : 'What\'s on you today';
    const subject =
        cadence === 'weekly' ?
            `Your week: ${taskCount} open task${taskCount === 1 ? '' : 's'}` :
            `Today: ${groups.overdue.length} overdue, ${groups.today.length} due`;

    const html = `<!doctype html>
<html><body style="${BODY_STYLE}">
<p style="color:#666;font-size:13px;margin:0">Taskgid</p>
<h1 style="font-size:20px;margin:4px 0 0 0">${title}, ${escapeHtml(user.firstName || user.username)}.</h1>
${renderSection('Overdue', groups.overdue, appUrl)}
${renderSection('Due today', groups.today, appUrl)}
${renderSection('Coming up', groups.upcoming, appUrl)}
<p style="margin-top:32px"><a href="${appUrl}/app/tasks" style="color:#111">Open my tasks</a></p>
<p style="color:#888;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:12px">
You are receiving this because ${cadence} digests are on.
<a href="${appUrl}/app/settings?section=preferences" style="color:#888">Change that</a>.
</p>
</body></html>`;

    return {subject, html, taskCount};
};

/**
 * Finds everyone whose digest is due at this instant and sends it.
 *
 * Safe to run more than once an hour: a user is only picked up during the hour
 * their local send time falls in, and callers should schedule it hourly.
 * @param {Date} [now] - Instant to evaluate.
 * @return {Promise<{considered: number, sent: number, skipped: number}>} Summary.
 */
export const sendDueDigests = async (now = new Date()) => {
    const preferences = await NotificationPreference.findAll({
        where: {
            workspaceId: null,
            emailEnabled: true,
            [Op.or]: [{dailyDigest: true}, {weeklyDigest: true}],
        },
        include: [{model: User, as: 'user', attributes: ['id', 'email', 'firstName', 'username', 'timezone']}],
    });

    let sent = 0;
    let skipped = 0;

    for (const preference of preferences) {
        const user = preference.user;
        if (!user?.email) {
            skipped += 1;
            continue;
        }

        const {hour, weekday} = localParts(now, user.timezone);
        if (hour !== DIGEST_HOUR) {
            skipped += 1;
            continue;
        }

        const cadence = preference.dailyDigest ?
            'daily' :
            weekday === WEEKLY_DIGEST_WEEKDAY ?
                'weekly' :
                null;
        if (!cadence) {
            skipped += 1;
            continue;
        }

        const digest = await buildDigest(user, cadence, now);
        if (!digest) {
            skipped += 1;
            continue;
        }

        await emailService._dispatchEmail({
            to: {email: user.email, name: user.firstName || user.username},
            subject: digest.subject,
            html: digest.html,
        });
        sent += 1;
    }

    return {considered: preferences.length, sent, skipped};
};

export default {buildDigest, groupForDigest, localParts, sendDueDigests};
