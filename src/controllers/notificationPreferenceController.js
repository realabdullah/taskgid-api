/**
 * Controller for reading and writing notification preferences.
 */
import NotificationPreference from '../models/NotificationPreference.js';
import User from '../models/User.js';
import {Workspace} from '../models/Workspace.js';
import {errorResponse, successResponse} from '../utils/responseUtils.js';
import {DEFAULT_PREFERENCES, resolvePreferences} from '../utils/notificationPreferences.js';

/** Only these may be written; anything else in the body is ignored. */
const WRITABLE_FIELDS = Object.keys(DEFAULT_PREFERENCES);

/**
 * Reads the caller's preferences, optionally for one workspace.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {Object} Response with the resolved preferences.
 */
export const getNotificationPreferences = async (req, res) => {
    try {
        const {workspaceSlug} = req.query;
        let workspaceId = null;

        if (workspaceSlug) {
            const workspace = await Workspace.findOne({
                where: {slug: workspaceSlug},
                attributes: ['id'],
            });
            if (!workspace) return errorResponse(res, 404, 'Workspace not found');
            workspaceId = workspace.id;
        }

        const preferences = await resolvePreferences(req.user.id, workspaceId);
        const user = await User.findByPk(req.user.id, {attributes: ['timezone']});

        // `hasOverride` lets the UI show whether a workspace differs from the
        // account default rather than making the user guess.
        const override = workspaceId ?
            await NotificationPreference.findOne({where: {userId: req.user.id, workspaceId}}) :
            null;

        return successResponse(res, {
            data: {
                ...preferences,
                timezone: user?.timezone || 'UTC',
                workspaceSlug: workspaceSlug || null,
                hasOverride: Boolean(override),
            },
        });
    } catch (error) {
        console.error('Get Notification Preferences Error:', error);
        return errorResponse(res, 500, 'Failed to load notification preferences');
    }
};

/**
 * Creates or updates the caller's preferences.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {Object} Response with the saved preferences.
 */
export const updateNotificationPreferences = async (req, res) => {
    try {
        const {workspaceSlug, timezone, ...body} = req.body;
        let workspaceId = null;

        if (workspaceSlug) {
            const workspace = await Workspace.findOne({
                where: {slug: workspaceSlug},
                attributes: ['id'],
            });
            if (!workspace) return errorResponse(res, 404, 'Workspace not found');
            workspaceId = workspace.id;
        }

        if (timezone !== undefined) {
            if (!isValidTimezone(timezone)) {
                return errorResponse(res, 400, 'Unrecognised timezone');
            }
            await User.update({timezone}, {where: {id: req.user.id}});
        }

        const updates = {};
        for (const field of WRITABLE_FIELDS) {
            if (body[field] !== undefined) updates[field] = body[field];
        }

        if (Object.keys(updates).length > 0) {
            const [row] = await NotificationPreference.findOrCreate({
                where: {userId: req.user.id, workspaceId},
                defaults: {userId: req.user.id, workspaceId, ...updates},
            });
            await row.update(updates);
        }

        const preferences = await resolvePreferences(req.user.id, workspaceId);
        return successResponse(res, {data: preferences});
    } catch (error) {
        console.error('Update Notification Preferences Error:', error);
        return errorResponse(res, 500, 'Failed to save notification preferences');
    }
};

/**
 * Removes a workspace override so the account default applies again.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {Object} Response with the preferences now in effect.
 */
export const clearWorkspaceOverride = async (req, res) => {
    try {
        const workspace = await Workspace.findOne({
            where: {slug: req.params.workspaceSlug},
            attributes: ['id'],
        });
        if (!workspace) return errorResponse(res, 404, 'Workspace not found');

        await NotificationPreference.destroy({
            where: {userId: req.user.id, workspaceId: workspace.id},
        });

        const preferences = await resolvePreferences(req.user.id, null);
        return successResponse(res, {data: preferences});
    } catch (error) {
        console.error('Clear Notification Override Error:', error);
        return errorResponse(res, 500, 'Failed to clear the workspace override');
    }
};

/**
 * Checks that a string is an IANA timezone this runtime knows.
 * @param {string} value - Candidate timezone name.
 * @return {boolean} True when usable.
 */
const isValidTimezone = (value) => {
    if (typeof value !== 'string' || !value) return false;
    try {
        new Intl.DateTimeFormat('en-GB', {timeZone: value});
        return true;
    } catch {
        return false;
    }
};
