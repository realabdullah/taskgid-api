import User from '../models/User.js';
import {tasksForCalendarFeed} from '../services/calendarService.js';
import {buildCalendarFeed} from '../utils/ics.js';
import {errorResponse, successResponse} from '../utils/responseUtils.js';

/**
 * Builds the feed URL for a raw token.
 * @param {string} token - The raw calendar feed token.
 * @return {string} The absolute .ics URL.
 */
const feedUrl = (token) => {
    const base = process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 8001}`;
    return `${base}/calendar/${token}.ics`;
};

/**
 * Whether the authenticated user currently has a calendar feed.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {Object} Response with `{enabled}`.
 */
export const getCalendarFeedStatus = async (req, res) => {
    return successResponse(res, {enabled: Boolean(req.user.calendarTokenHash)});
};

/**
 * Creates or rotates the authenticated user's calendar feed token.
 *
 * Only the hash is stored, so this is the only response that ever carries the
 * raw token — losing it means generating a new one.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {Object} Response with the feed `{url}`.
 */
export const createCalendarFeedToken = async (req, res) => {
    const token = req.user.generateCalendarToken();
    await req.user.save();
    return successResponse(res, {url: feedUrl(token)});
};

/**
 * Revokes the authenticated user's calendar feed. The existing URL stops
 * working immediately.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {Object} Response confirming revocation.
 */
export const revokeCalendarFeedToken = async (req, res) => {
    await User.update({calendarTokenHash: null}, {where: {id: req.user.id}});
    return successResponse(res, {enabled: false});
};

/**
 * Serves one user's .ics feed. Authenticated by the token in the path rather
 * than a session, since calendar clients cannot send an Authorization header.
 * @param {Object} req - Express request object.
 * @param {Object} req.params - Request parameters.
 * @param {string} req.params.token - The raw calendar feed token.
 * @param {Object} res - Express response object.
 * @return {void}
 */
export const serveCalendarFeed = async (req, res) => {
    const user = await User.findByCalendarToken(req.params.token);
    if (!user) return errorResponse(res, 404, 'Calendar feed not found');

    const tasks = await tasksForCalendarFeed(user.id);
    const appUrl = process.env.FRONTEND_URL || 'https://tasks.abdspace.xyz';

    const ics = buildCalendarFeed(tasks, {
        calendarName: `Taskgid — ${user.firstName || user.username}`,
        taskUrl: (taskId, workspaceSlug) => workspaceSlug ?
            `${appUrl}/app/workspaces/${workspaceSlug}/tasks?taskId=${taskId}` :
            appUrl,
    });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="taskgid.ics"');
    // A calendar app should keep polling rather than caching this away.
    res.setHeader('Cache-Control', 'no-store');
    res.send(ics);
};
