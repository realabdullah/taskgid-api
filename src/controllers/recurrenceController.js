import Tag from '../models/Tag.js';
import Task from '../models/Task.js';
import TaskRecurrence from '../models/TaskRecurrence.js';
import User from '../models/User.js';
import WorkspaceTeam from '../models/WorkspaceTeam.js';
import {Workspace} from '../models/Workspace.js';
import {Op} from 'sequelize';
import {normaliseChecklist} from '../utils/checklist.js';
import {createPaginatedResponse, getPaginationParams} from '../utils/pagination.js';
import {errorResponse, successResponse} from '../utils/responseUtils.js';
import {sanitizePlainText, sanitizeRichText} from '../utils/sanitizer.js';
import {nextOccurrence, validateRule} from '../services/recurrenceService.js';

/**
 * Get workspace ID from slug
 * @param {string} slug - Workspace slug
 * @return {Promise<string>} - Workspace ID
 * @throws {Object} - Error object with status and message if workspace not found
 */
const getWorkspaceIdFromSlug = async (slug) => {
    const workspace = await Workspace.findOne({where: {slug}, attributes: ['id']});
    if (!workspace) {
        // eslint-disable-next-line no-throw-literal
        throw {status: 404, message: 'Workspace not found'};
    }
    return workspace.id;
};

/**
 * Resolve assignee usernames to ids, keeping only workspace members.
 *
 * A rule can sit unused for months, so an id that was never a member would only
 * fail when an occurrence came due — long after whoever wrote the rule could
 * connect the two.
 * @param {Array<string>} usernames - Assignee usernames.
 * @param {string} workspaceId - Workspace the rule belongs to.
 * @return {Promise<Array<string>>} Member user ids.
 */
const resolveAssignees = async (usernames, workspaceId) => {
    if (!Array.isArray(usernames) || usernames.length === 0) return [];

    const users = await User.findAll({
        where: {username: {[Op.in]: usernames}},
        attributes: ['id'],
    });
    const ids = users.map((user) => user.id);
    if (ids.length === 0) return [];

    const members = await WorkspaceTeam.findAll({
        where: {workspaceId, userId: {[Op.in]: ids}},
        attributes: ['userId'],
    });
    return members.map((member) => member.userId);
};

/**
 * Resolve tag names to ids within the workspace.
 * @param {Array<string>} names - Tag names.
 * @param {string} workspaceId - Workspace the rule belongs to.
 * @return {Promise<Array<string>>} Tag ids.
 */
const resolveTags = async (names, workspaceId) => {
    if (!Array.isArray(names) || names.length === 0) return [];
    const tags = await Tag.findAll({
        where: {name: {[Op.in]: names}, workspaceId},
        attributes: ['id'],
    });
    return tags.map((tag) => tag.id);
};

/**
 * Shape a rule for the wire, with the next occurrence it will produce.
 * @param {Object} recurrence - A TaskRecurrence instance.
 * @return {Object} Plain rule with `nextOccurrence`.
 */
const present = (recurrence) => ({
    ...recurrence.get({plain: true}),
    nextOccurrence: nextOccurrence(recurrence),
});

/**
 * List a workspace's recurrence rules.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @return {Object} Paginated rules or an error
 */
export const getWorkspaceRecurrences = async (req, res) => {
    try {
        const {workspaceSlug} = req.params;
        const {page, limit, offset} = getPaginationParams(req.query);
        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug);

        const {count, rows} = await TaskRecurrence.findAndCountAll({
            where: {workspaceId},
            include: [
                {
                    model: User,
                    as: 'creator',
                    attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
                },
            ],
            limit,
            offset,
            order: [['createdAt', 'DESC']],
        });

        return successResponse(res, createPaginatedResponse(rows.map(present), count, page, limit));
    } catch (error) {
        console.error('Get Recurrences Error:', error);
        return errorResponse(res, error.status || 500, error.message || 'Failed to fetch recurrences');
    }
};

/**
 * Create a recurrence rule.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @return {Object} The created rule or an error
 */
export const createRecurrence = async (req, res) => {
    try {
        const {workspaceSlug} = req.params;
        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug);
        const {rrule, timezone, priority, estimateMinutes, assignees, tags} = req.body;

        const ruleError = validateRule(rrule);
        if (ruleError) return errorResponse(res, 400, ruleError);

        const title = sanitizePlainText(req.body.title);
        if (!title) return errorResponse(res, 400, 'A title is required');

        const {items: checklist, error: checklistError} = normaliseChecklist(req.body.checklist);
        if (checklistError) return errorResponse(res, 400, checklistError);

        const recurrence = await TaskRecurrence.create({
            rrule,
            timezone: timezone || 'UTC',
            title,
            description: sanitizeRichText(req.body.description),
            priority: priority || 'medium',
            estimateMinutes: estimateMinutes ?? null,
            // Stored as authored; each instance takes a copy with items reset.
            checklist,
            assigneeIds: await resolveAssignees(assignees, workspaceId),
            tagIds: await resolveTags(tags, workspaceId),
            workspaceId,
            createdById: req.user.id,
        });

        return successResponse(res, {data: present(recurrence)}, 201);
    } catch (error) {
        console.error('Create Recurrence Error:', error);
        return errorResponse(res, error.status || 500, error.message || 'Failed to create the recurrence');
    }
};

/**
 * Update a recurrence rule.
 *
 * Editing a rule changes what future instances look like and never touches the
 * tasks it has already produced — those are finished or in-flight work, not
 * copies of the template.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @return {Object} The updated rule or an error
 */
export const updateRecurrence = async (req, res) => {
    try {
        const {workspaceSlug, recurrenceId} = req.params;
        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug);

        const recurrence = await TaskRecurrence.findOne({
            where: {id: recurrenceId, workspaceId},
        });
        if (!recurrence) return errorResponse(res, 404, 'Recurrence not found in this workspace');

        const updates = {};
        if (req.body.rrule !== undefined) {
            const ruleError = validateRule(req.body.rrule);
            if (ruleError) return errorResponse(res, 400, ruleError);
            updates.rrule = req.body.rrule;
        }
        if (req.body.title !== undefined) {
            const title = sanitizePlainText(req.body.title);
            if (!title) return errorResponse(res, 400, 'A title is required');
            updates.title = title;
        }
        if (req.body.description !== undefined) {
            updates.description = sanitizeRichText(req.body.description);
        }
        if (req.body.checklist !== undefined) {
            const {items, error} = normaliseChecklist(req.body.checklist);
            if (error) return errorResponse(res, 400, error);
            updates.checklist = items;
        }
        if (req.body.assignees !== undefined) {
            updates.assigneeIds = await resolveAssignees(req.body.assignees, workspaceId);
        }
        if (req.body.tags !== undefined) {
            updates.tagIds = await resolveTags(req.body.tags, workspaceId);
        }
        for (const field of ['timezone', 'priority', 'estimateMinutes', 'isActive']) {
            if (req.body[field] !== undefined) updates[field] = req.body[field];
        }

        await recurrence.update(updates);
        return successResponse(res, {data: present(recurrence)});
    } catch (error) {
        console.error('Update Recurrence Error:', error);
        return errorResponse(res, error.status || 500, error.message || 'Failed to update the recurrence');
    }
};

/**
 * Delete a recurrence rule.
 *
 * The tasks it produced stay. Ending a schedule is a statement about the future,
 * not a retraction of work that was already done under it — so the instances
 * keep their history and simply lose their link to the rule.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @return {Object} A summary of what was kept, or an error
 */
export const deleteRecurrence = async (req, res) => {
    try {
        const {workspaceSlug, recurrenceId} = req.params;
        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug);

        const recurrence = await TaskRecurrence.findOne({
            where: {id: recurrenceId, workspaceId},
        });
        if (!recurrence) return errorResponse(res, 404, 'Recurrence not found in this workspace');

        const keptInstances = await Task.count({where: {recurrenceId}});
        await recurrence.destroy();

        return successResponse(res, {
            message: 'Recurrence deleted',
            data: {keptInstances},
        });
    } catch (error) {
        console.error('Delete Recurrence Error:', error);
        return errorResponse(res, error.status || 500, error.message || 'Failed to delete the recurrence');
    }
};
