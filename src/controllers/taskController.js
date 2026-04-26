/* eslint-disable require-jsdoc */
import Task from '../models/Task.js';
import User from '../models/User.js';
import {Workspace} from '../models/Workspace.js';
import TaskAssignee from '../models/TaskAssignee.js';
import Tag from '../models/Tag.js';
import TaskTag from '../models/TaskTag.js';
import {logWorkspaceActivity, logTaskActivity} from '../utils/activityLogger.js';
import {errorResponse, successResponse} from '../utils/responseUtils.js';
import notificationService from '../services/notificationService.js';
import 'dotenv/config';
import {getPaginationParams, createPaginatedResponse} from '../utils/pagination.js';
import {Op} from 'sequelize';
import TaskActivity from '../models/TaskActivity.js';
import {NOTIFICATION_TYPES} from '../constants/notificationTypes.js';
import sequelize from '../config/database.js';

/**
 * Get user ID by assignee username
 * @param {string} assigneeUsername - Username of the assignee
 * @return {Promise<string|null>} - User ID or null if not found
 */
const getAssignee = async (assigneeUsername) => {
    if (!assigneeUsername) return null;
    const user = await User.findOne({where: {username: assigneeUsername}, attributes: ['id']});
    return user ? user.id : null;
};

/**
 * Get multiple user IDs by their usernames
 * @param {Array<string>} assigneeUsernames - Array of usernames
 * @return {Promise<Array<string>>} - Array of user IDs
 */
const getAssignees = async (assigneeUsernames) => {
    if (!assigneeUsernames || !assigneeUsernames.length) return [];

    const assigneeIds = [];
    for (const username of assigneeUsernames) {
        const userId = await getAssignee(username);
        if (userId) assigneeIds.push(userId);
    }

    return assigneeIds;
};

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
 * Parse query parameter into array
 * @param {string|Array<string>} queryParam - Query parameter to parse
 * @return {Array<string>|undefined} - Parsed array or undefined if empty
 */
const parseQueryArray = (queryParam) => {
    if (!queryParam) return undefined;
    if (Array.isArray(queryParam)) return queryParam.filter((item) => item.trim() !== '');
    return queryParam.split(',').map((item) => item.trim()).filter((item) => item.trim() !== '');
};

/**
 * Get tag IDs by tag names within a workspace
 * @param {Array<string>} tagNames - Array of tag names
 * @param {string} workspaceId - Workspace ID
 * @return {Promise<Array<string>>} - Array of tag IDs
 */
const getTagIds = async (tagNames, workspaceId) => {
    if (!tagNames || !tagNames.length) return [];

    const tags = await Tag.findAll({
        where: {
            name: {[Op.in]: tagNames},
            workspaceId,
        },
        attributes: ['id'],
    });

    return tags.map((tag) => tag.id);
};

/**
 * Create a new task in the specified workspace
 * @param {Object} req - Express request object
 * @param {Object} req.params - Request parameters
 * @param {string} req.params.workspaceSlug - Workspace slug
 * @param {Object} req.body - Request body with task details
 * @param {string} req.body.title - Task title
 * @param {string} req.body.description - Task description
 * @param {string} req.body.status - Task status
 * @param {string} req.body.priority - Task priority
 * @param {string} req.body.dueDate - Task due date
 * @param {Array<string>} req.body.assignees - Array of assignee usernames
 * @param {Array<string>} [req.body.tags] - Array of tag names
 * @param {Object} req.user - Authenticated user
 * @param {Object} res - Express response object
 * @return {Object} Response with created task data or error
 */
export const addTask = async (req, res) => {
    try {
        const {workspaceSlug} = req.params;
        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug);

        const {title, description, status, priority, dueDate, assignees, tags} = req.body;
        const assigneeIds = await getAssignees(assignees);
        const tagIds = await getTagIds(tags, workspaceId);

        const task = await Task.create({
            title,
            description,
            status,
            priority,
            dueDate,
            workspaceId,
            createdById: req.user.id,
        });

        if (assigneeIds.length > 0) {
            const assigneeEntries = assigneeIds.map((userId) => ({
                taskId: task.id,
                userId,
            }));
            await TaskAssignee.bulkCreate(assigneeEntries);

            const meta = {taskId: task.id, taskTitle: task.title, assigneeIds};
            await logTaskActivity(task.id, req.user.id, 'assigned', meta);
            await logWorkspaceActivity(workspaceId, req.user.id, 'task_assigned', meta);

            await notificationService.sendTaskAssignmentNotification(
                task.id,
                task.title,
                req.user.id,
                req.user.firstName || req.user.username,
                assigneeIds,
            );
        }

        if (tagIds.length > 0) {
            const tagEntries = tagIds.map((tagId) => ({
                taskId: task.id,
                tagId,
            }));
            await TaskTag.bulkCreate(tagEntries);

            const meta = {taskId: task.id, taskTitle: task.title, tagIds};
            await logTaskActivity(task.id, req.user.id, 'tags_added', meta);
        }

        await logTaskActivity(task.id, req.user.id, 'created', {taskTitle: task.title});
        await logWorkspaceActivity(
            workspaceId,
            req.user.id,
            'task_created',
            {taskId: task.id, taskTitle: task.title},
        );

        const populatedTask = await Task.findByPk(task.id, {
            include: [
                {
                    model: User,
                    as: 'assignees',
                    attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
                    through: {attributes: []},
                },
                {
                    model: User,
                    as: 'creator',
                    attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
                },
                {
                    model: Tag,
                    as: 'tags',
                    attributes: ['id', 'name', 'color'],
                    through: {attributes: []},
                },
            ],
            attributes: {
                include: [
                    [sequelize.literal('(SELECT COUNT(*) FROM comments WHERE comments.task_id = "Task".id)'),
                        'commentCount'],
                ],
            },
        });

        return successResponse(res, {data: populatedTask.toJSON()}, 201);
    } catch (error) {
        console.error('Add Task Error:', error);
        const statusCode = error.status || 400;
        return errorResponse(res, statusCode, error.message || 'Failed to add task');
    }
};

/**
 * Update an existing task in the specified workspace
 * @param {Object} req - Express request object
 * @param {Object} req.params - Request parameters
 * @param {string} req.params.workspaceSlug - Workspace slug
 * @param {string} req.params.id - Task ID
 * @param {Object} req.body - Request body with fields to update
 * @param {string} [req.body.title] - Updated task title
 * @param {string} [req.body.description] - Updated task description
 * @param {string} [req.body.status] - Updated task status
 * @param {string} [req.body.priority] - Updated task priority
 * @param {string} [req.body.dueDate] - Updated task due date
 * @param {Array<string>} [req.body.assignees] - Updated array of assignee usernames
 * @param {Array<string>} [req.body.tags] - Updated array of tag names
 * @param {Object} req.user - Authenticated user
 * @param {Object} res - Express response object
 * @return {Object} Response with updated task data or error
 */
export const updateTask = async (req, res) => {
    try {
        const {workspaceSlug, id: taskId} = req.params;
        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug);

        const updateData = req.body;
        const newAssigneeIds = updateData.assignees ? await getAssignees(updateData.assignees) : undefined;
        const newTagIds = updateData.tags ? await getTagIds(updateData.tags, workspaceId) : undefined;

        const task = await Task.findOne({
            where: {
                id: taskId,
                workspaceId,
            },
            include: [
                {
                    model: User,
                    as: 'assignees',
                    attributes: ['id'],
                },
                {
                    model: Tag,
                    as: 'tags',
                    attributes: ['id'],
                },
            ],
        });

        if (!task) {
            return errorResponse(res, 404, 'Task not found in this workspace');
        }

        const membership = await sequelize.models.WorkspaceTeam.findOne({
            where: {workspaceId, userId: req.user.id},
        });
        const isAdmin = membership && ['admin', 'creator'].includes(membership.role);

        if (task.createdById !== req.user.id && !isAdmin) {
            return errorResponse(res, 403, 'Only the task creator or workspace admins can update this task');
        }

        const originalData = task.get({plain: true});
        const originalAssigneeIds = originalData.assignees.map((assignee) => assignee.id);
        const originalTagIds = originalData.tags.map((tag) => tag.id);

        const allowedFields = ['title', 'description', 'status', 'priority', 'dueDate'];
        const updatePayload = {};

        allowedFields.forEach((field) => {
            if (updateData[field] !== undefined) {
                updatePayload[field] = updateData[field];
            }
        });

        if (Object.keys(updatePayload).length > 0) await task.update(updatePayload);

        const usersToNotify = new Set([...newAssigneeIds || [], task.createdById]);

        if (updatePayload.status !== undefined && originalData.status !== updatePayload.status) {
            const meta = {
                taskId: task.id,
                taskTitle: task.title,
                changeDetails: {field: 'status', from: originalData.status, to: updatePayload.status},
            };
            await logTaskActivity(task.id, req.user.id, 'status_changed', meta);
            await logWorkspaceActivity(workspaceId, req.user.id, 'task_updated', meta);

            await notificationService.sendBulkNotification(
                Array.from(usersToNotify),
                NOTIFICATION_TYPES.TASK_UPDATED,
                {
                    taskId: task.id,
                    taskTitle: task.title,
                    updaterId: req.user.id,
                    updaterName: req.user.firstName || req.user.username,
                },
            );
        }

        if (updatePayload.priority !== undefined && originalData.priority !== updatePayload.priority) {
            const meta = {
                taskId: task.id,
                taskTitle: task.title,
                changeDetails: {field: 'priority', from: originalData.priority, to: updatePayload.priority},
            };
            await logTaskActivity(task.id, req.user.id, 'priority_changed', meta);
            await logWorkspaceActivity(workspaceId, req.user.id, 'task_updated', meta);

            await notificationService.sendBulkNotification(
                Array.from(usersToNotify),
                NOTIFICATION_TYPES.TASK_UPDATED,
                {
                    taskId: task.id,
                    taskTitle: task.title,
                    updaterId: req.user.id,
                    updaterName: req.user.firstName || req.user.username,
                },
            );
        }

        const generalChanges = {};
        ['title', 'description', 'dueDate'].forEach((key) => {
            if (updatePayload[key] !== undefined && originalData[key] !== updatePayload[key]) {
                generalChanges[key] = {from: originalData[key], to: updatePayload[key]};
            }
        });

        if (Object.keys(generalChanges).length > 0) {
            const meta = {taskId: task.id, taskTitle: task.title, changes: generalChanges};
            await logTaskActivity(task.id, req.user.id, 'updated', meta);
            await logWorkspaceActivity(workspaceId, req.user.id, 'task_updated', meta);

            await notificationService.sendBulkNotification(
                Array.from(usersToNotify),
                NOTIFICATION_TYPES.TASK_UPDATED,
                {
                    taskId: task.id,
                    taskTitle: task.title,
                    updaterId: req.user.id,
                    updaterName: req.user.firstName || req.user.username,
                },
            );
        }

        if (newAssigneeIds !== undefined) {
            const removedAssigneeIds = originalAssigneeIds.filter((id) => !newAssigneeIds.includes(id));
            const addedAssigneeIds = newAssigneeIds.filter((id) => !originalAssigneeIds.includes(id));

            if (removedAssigneeIds.length > 0) {
                await TaskAssignee.destroy({where: {taskId: task.id, userId: {[Op.in]: removedAssigneeIds}}});
                const meta = {taskId: task.id, taskTitle: task.title, removedAssigneeIds: removedAssigneeIds};
                await logTaskActivity(task.id, req.user.id, 'unassigned', meta);
                await logWorkspaceActivity(workspaceId, req.user.id, 'task_unassigned', meta);
            }

            if (addedAssigneeIds.length > 0) {
                const newEntries = addedAssigneeIds.map((userId) => ({taskId: task.id, userId}));
                await TaskAssignee.bulkCreate(newEntries);

                const meta = {taskId: task.id, taskTitle: task.title, addedAssigneeIds: addedAssigneeIds};
                await logTaskActivity(task.id, req.user.id, 'assigned', meta);
                await logWorkspaceActivity(workspaceId, req.user.id, 'task_assigned', meta);

                await notificationService.sendTaskAssignmentNotification(
                    task.id,
                    task.title,
                    req.user.id,
                    req.user.firstName || req.user.username,
                    addedAssigneeIds,
                );
            }
        }

        // Handle tag updates
        if (newTagIds !== undefined) {
            const removedTagIds = originalTagIds.filter((id) => !newTagIds.includes(id));
            const addedTagIds = newTagIds.filter((id) => !originalTagIds.includes(id));

            if (removedTagIds.length > 0) {
                await TaskTag.destroy({where: {taskId: task.id, tagId: {[Op.in]: removedTagIds}}});
                const meta = {taskId: task.id, taskTitle: task.title, removedTagIds};
                await logTaskActivity(task.id, req.user.id, 'tags_removed', meta);
            }

            if (addedTagIds.length > 0) {
                const newTagEntries = addedTagIds.map((tagId) => ({taskId: task.id, tagId}));
                await TaskTag.bulkCreate(newTagEntries);
                const meta = {taskId: task.id, taskTitle: task.title, addedTagIds};
                await logTaskActivity(task.id, req.user.id, 'tags_added', meta);
            }
        }

        const updatedTask = await Task.findByPk(task.id, {
            include: [
                {
                    model: User,
                    as: 'assignees',
                    attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
                    through: {attributes: []},
                },
                {model: User, as: 'creator', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture']},
                {
                    model: Tag,
                    as: 'tags',
                    attributes: ['id', 'name', 'color'],
                    through: {attributes: []},
                },
            ],
            attributes: {
                include: [
                    [sequelize.literal('(SELECT COUNT(*) FROM comments WHERE comments.task_id = "Task".id)'),
                        'commentCount'],
                ],
            },
        });

        return successResponse(res, {data: updatedTask.toJSON()});
    } catch (error) {
        console.error('Update Task Error:', error);
        const statusCode = error.status || 400;
        return errorResponse(res, statusCode, error.message || 'Failed to update task');
    }
};

/**
 * Fetch a single task from a workspace
 * @param {Object} req - Express request object
 * @param {Object} req.params - Request parameters
 * @param {string} req.params.workspaceSlug - Workspace slug
 * @param {string} req.params.id - Task ID
 * @param {Object} res - Express response object
 * @return {Object} Response with task data or error
 */
export const fetchWorkspaceTask = async (req, res) => {
    try {
        const {workspaceSlug, id: taskId} = req.params;
        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug);

        const task = await Task.findOne({
            where: {
                id: taskId,
                workspaceId,
            },
            include: [
                {
                    model: User,
                    as: 'assignees',
                    attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
                    through: {attributes: []},
                },
                {model: User, as: 'creator', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture']},
                {
                    model: Tag,
                    as: 'tags',
                    attributes: ['id', 'name', 'color'],
                    through: {attributes: []},
                },
            ],
            attributes: {
                include: [
                    [sequelize.literal('(SELECT COUNT(*) FROM comments WHERE comments.task_id = "Task".id)'),
                        'commentCount'],
                ],
            },
        });

        if (!task) {
            return errorResponse(res, 404, 'Task not found in this workspace');
        }

        return successResponse(res, {data: task.toJSON()});
    } catch (error) {
        console.error('Fetch Task Error:', error);
        const statusCode = error.status || 400;
        return errorResponse(res, statusCode, error.message || 'Failed to fetch task');
    }
};

/**
 * Delete a task from a workspace
 * @param {Object} req - Express request object
 * @param {Object} req.params - Request parameters
 * @param {string} req.params.workspaceSlug - Workspace slug
 * @param {string} req.params.id - Task ID
 * @param {Object} req.user - Authenticated user
 * @param {Object} res - Express response object
 * @return {Object} Response with success message or error
 */
export const deleteTask = async (req, res) => {
    try {
        const {workspaceSlug, id: taskId} = req.params;
        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug);

        const task = await Task.findOne({where: {id: taskId, workspaceId}});
        if (!task) return errorResponse(res, 404, 'Task not found in this workspace');

        const membership = await sequelize.models.WorkspaceTeam.findOne({
            where: {workspaceId, userId: req.user.id},
        });
        const isAdmin = membership && ['admin', 'creator'].includes(membership.role);

        if (task.createdById !== req.user.id && !isAdmin) {
            return errorResponse(res, 403, 'Only the task creator or workspace admins can delete this task');
        }

        const meta = {taskId: task.id, taskTitle: task.title};

        await TaskAssignee.destroy({where: {taskId: task.id}});
        await task.destroy();

        await logWorkspaceActivity(workspaceId, req.user.id, 'task_deleted', meta);

        return successResponse(res, {message: 'Task deleted successfully'});
    } catch (error) {
        console.error('Delete Task Error:', error);
        const statusCode = error.status || 400;
        return errorResponse(res, statusCode, error.message || 'Failed to delete task');
    }
};

/**
 * Fetch tasks from a workspace with filtering and pagination
 * @param {Object} req - Express request object
 * @param {Object} req.params - Request parameters
 * @param {string} req.params.workspaceSlug - Workspace slug
 * @param {Object} req.query - Query parameters for filtering and pagination
 * @param {string} [req.query.search] - Search term for task title and description
 * @param {string} [req.query.assignee] - Filter by assignee (can be 'me' or 'unassigned')
 * @param {string|Array<string>} [req.query.status] - Filter by status
 * @param {string|Array<string>} [req.query.priority] - Filter by priority
 * @param {string|Array<string>} [req.query.tags] - Filter by tag names
 * @param {number} [req.query.page] - Page number for pagination
 * @param {number} [req.query.limit] - Number of items per page
 * @param {Object} req.user - Authenticated user
 * @param {Object} res - Express response object
 * @return {Object} Response with paginated tasks or error
 */
export const fetchWorkspaceTasks = async (req, res) => {
    try {
        const {workspaceSlug} = req.params;
        const {page, limit, offset} = getPaginationParams(req.query);

        const {search, assignee} = req.query;
        const statusFilter = parseQueryArray(req.query.status);
        const priorityFilter = parseQueryArray(req.query.priority);
        const tagsFilter = parseQueryArray(req.query.tags);
        const currentUserId = req.user?.id;
        if (assignee === 'me' && !currentUserId) {
            return errorResponse(res, 401, 'Authentication required to filter by tasks assigned to you.');
        }

        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug);
        if (!workspaceId) return errorResponse(res, 404, 'Workspace not found.');

        const whereConditions = {workspaceId};
        const includeConditions = [
            {
                model: User,
                as: 'assignees',
                attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
                through: {attributes: []},
                required: false,
            },
            {model: User, as: 'creator', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture']},
            {
                model: Tag,
                as: 'tags',
                attributes: ['id', 'name', 'color'],
                through: {attributes: []},
                required: false,
            },
        ];

        if (search) {
            whereConditions[Op.or] = [
                {title: {[Op.iLike]: `%${search}%`}},
                {description: {[Op.iLike]: `%${search}%`}},
            ];
        }

        if (statusFilter && statusFilter.length > 0) {
            const validStatuses = ['todo', 'in_progress', 'done'];
            const filteredStatuses = statusFilter.filter((s) => validStatuses.includes(s));
            if (filteredStatuses.length > 0) whereConditions.status = {[Op.in]: filteredStatuses};
        }

        if (priorityFilter && priorityFilter.length > 0) {
            const validPriorities = ['low', 'medium', 'high'];
            const filteredPriorities = priorityFilter.filter((p) => validPriorities.includes(p));
            if (filteredPriorities.length > 0) whereConditions.priority = {[Op.in]: filteredPriorities};
        }

        if (tagsFilter && tagsFilter.length > 0) {
            const tagsInclude = includeConditions.find((inc) => inc.as === 'tags');
            if (tagsInclude) {
                tagsInclude.where = {name: {[Op.in]: tagsFilter}};
                tagsInclude.required = true;
            }
        }

        if (assignee) {
            const assigneesInclude = includeConditions.find((inc) => inc.as === 'assignees');
            if (assigneesInclude) {
                if (assignee === 'me') {
                    assigneesInclude.where = {id: currentUserId};
                    assigneesInclude.required = true;
                } else if (assignee === 'unassigned') {
                    whereConditions['$assignees.id$'] = {[Op.is]: null};
                    assigneesInclude.required = false;
                }
            }
        }

        const {count, rows: tasks} = await Task.findAndCountAll({
            where: whereConditions,
            include: includeConditions,
            limit,
            offset,
            order: [['createdAt', 'DESC']],
            distinct: true,
            subQuery: false,
            attributes: {
                include: [
                    [sequelize.literal('(SELECT COUNT(*) FROM comments WHERE comments.task_id = "Task".id)'),
                        'commentCount'],
                ],
            },
        });

        const response = createPaginatedResponse(
            tasks,
            count,
            parseInt(page || 1),
            parseInt(limit || 10),
        );
        return successResponse(res, response);
    } catch (error) {
        console.error('Fetch Tasks Error:', error);
        const statusCode = error.status || 400;
        return errorResponse(res, statusCode, error.message || 'Failed to fetch tasks');
    }
};

/**
 * Get activities for a specific task
 * @param {Object} req - Express request object
 * @param {Object} req.params - Request parameters
 * @param {string} req.params.workspaceSlug - Workspace slug
 * @param {string} req.params.id - Task ID
 * @param {Object} req.query - Query parameters for pagination
 * @param {number} [req.query.page] - Page number for pagination
 * @param {number} [req.query.limit] - Number of items per page
 * @param {Object} res - Express response object
 * @return {Object} Response with paginated task activities or error
 */
export const getTaskActivities = async (req, res) => {
    try {
        const {workspaceSlug, id: taskId} = req.params;
        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug);
        const {page, limit, offset} = getPaginationParams(req.query);

        const task = await Task.findOne({
            where: {id: taskId, workspaceId},
        });

        if (!task) return errorResponse(res, 404, 'Task not found in this workspace');

        const {count, rows: activities} = await TaskActivity.findAndCountAll({
            where: {taskId},
            include: [{
                model: User,
                as: 'user',
                attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
            }],
            limit,
            offset,
            order: [['createdAt', 'DESC']],
        });

        const response = createPaginatedResponse(activities, count, page, limit);
        res.json(response);
    } catch (error) {
        console.error('Get Task Activities Error:', error);
        const statusCode = error.status || 500;
        return errorResponse(res, statusCode, error.message || 'Failed to fetch task activities');
    }
};

/**
 * Batch assign multiple tasks to a single user
 * @param {Object} req - Express request object
 * @param {Object} req.params - Request parameters
 * @param {string} req.params.workspaceSlug - Workspace slug
 * @param {Object} req.body - Request body
 * @param {Array<string>} req.body.taskIds - Array of task IDs to assign
 * @param {string} req.body.assigneeId - ID of the user to assign tasks to
 * @param {Object} req.user - Authenticated user
 * @param {Object} res - Express response object
 * @return {Object} Response with assignment results or error
 */
export const batchAssignTasks = async (req, res) => {
    try {
        const {workspaceSlug} = req.params;
        const {taskIds, assigneeId} = req.body;

        if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
            return errorResponse(res, 400, 'Task IDs array is required');
        }

        if (!assigneeId) return errorResponse(res, 400, 'Assignee ID is required');

        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug);
        const workspaceTeam = await sequelize.models.WorkspaceTeam.findOne({
            where: {workspaceId: workspaceId, userId: assigneeId},
        });

        if (!workspaceTeam) return errorResponse(res, 403, 'Assignee is not a member of this workspace');

        const tasks = await Task.findAll({
            where: {id: {[Op.in]: taskIds}, workspaceId},
            attributes: ['id', 'title'],
        });

        if (tasks.length === 0) return errorResponse(res, 404, 'No valid tasks found in this workspace');

        const foundTaskIds = tasks.map((task) => task.id);
        const invalidTaskIds = taskIds.filter((id) => !foundTaskIds.includes(id));

        const existingAssignments = await TaskAssignee.findAll({
            where: {taskId: {[Op.in]: foundTaskIds}, userId: assigneeId},
        });

        const existingTaskIds = existingAssignments.map((assignment) => assignment.taskId);
        const newTaskIds = foundTaskIds.filter((id) => !existingTaskIds.includes(id));

        if (newTaskIds.length > 0) {
            const assignmentEntries = newTaskIds.map((taskId) => ({taskId, userId: assigneeId}));
            await TaskAssignee.bulkCreate(assignmentEntries);

            // Log activity for each task
            for (const taskId of newTaskIds) {
                const task = tasks.find((t) => t.id === taskId);
                const meta = {
                    taskId,
                    taskTitle: task.title,
                    assigneeIds: [assigneeId],
                };

                await logTaskActivity(taskId, req.user.id, 'assigned', meta);
                await logWorkspaceActivity(workspaceId, req.user.id, 'task_assigned', meta);
            }

            // Send notification to assignee (as a batch notification)
            await notificationService.sendBulkNotification(
                [assigneeId],
                NOTIFICATION_TYPES.TASK_ASSIGNED,
                {
                    taskCount: newTaskIds.length,
                    assignerId: req.user.id,
                    assignerName: req.user.firstName || req.user.username,
                    workspaceSlug,
                },
            );
        }

        return successResponse(res, {
            message: 'Tasks assigned successfully',
            data: {
                tasksAssigned: newTaskIds.length,
                alreadyAssigned: existingTaskIds.length,
                invalidTasks: invalidTaskIds.length,
            },
        });
    } catch (error) {
        console.error('Batch Assign Tasks Error:', error);
        const statusCode = error.status || 500;
        return errorResponse(res, statusCode, error.message || 'Failed to assign tasks');
    }
};

/**
 * Advanced search and filtering for workspace tasks
 * @param {Object} req - Express request object
 * @param {Object} req.params - Request parameters
 * @param {string} req.params.workspaceSlug - Workspace slug
 * @param {Object} req.query - Query parameters for advanced filtering
 * @param {string} [req.query.search] - Search term for task title, description, and comments
 * @param {string} [req.query.assignee] - Filter by assignee username or 'me' or 'unassigned'
 * @param {string|Array<string>} [req.query.status] - Filter by status
 * @param {string|Array<string>} [req.query.priority] - Filter by priority
 * @param {string|Array<string>} [req.query.tags] - Filter by tag names
 * @param {string} [req.query.creator] - Filter by task creator username
 * @param {string} [req.query.dueDateFrom] - Filter tasks due after this date (ISO string)
 * @param {string} [req.query.dueDateTo] - Filter tasks due before this date (ISO string)
 * @param {string} [req.query.createdFrom] - Filter tasks created after this date (ISO string)
 * @param {string} [req.query.createdTo] - Filter tasks created before this date (ISO string)
 * @param {string} [req.query.sortBy] - Sort by field (title, dueDate, priority, createdAt, updatedAt)
 * @param {string} [req.query.sortOrder] - Sort order (ASC or DESC)
 * @param {boolean} [req.query.includeComments] - Include comment content in search
 * @param {number} [req.query.page] - Page number for pagination
 * @param {number} [req.query.limit] - Number of items per page
 * @param {Object} req.user - Authenticated user
 * @param {Object} res - Express response object
 * @return {Object} Response with paginated and filtered tasks or error
 */
export const advancedSearchTasks = async (req, res) => {
    try {
        const {workspaceSlug} = req.params;
        const {page, limit, offset} = getPaginationParams(req.query);

        const {
            search,
            assignee,
            creator,
            dueDateFrom,
            dueDateTo,
            createdFrom,
            createdTo,
            sortBy = 'createdAt',
            sortOrder = 'DESC',
            includeComments = false,
        } = req.query;

        const statusFilter = parseQueryArray(req.query.status);
        const priorityFilter = parseQueryArray(req.query.priority);
        const tagsFilter = parseQueryArray(req.query.tags);
        const currentUserId = req.user?.id;

        if (assignee === 'me' && !currentUserId) {
            return errorResponse(res, 401, 'Authentication required to filter by tasks assigned to you.');
        }

        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug);

        const whereConditions = {workspaceId};
        const includeConditions = [
            {
                model: User,
                as: 'assignees',
                attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
                through: {attributes: []},
                required: false,
            },
            {
                model: User,
                as: 'creator',
                attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
            },
            {
                model: Tag,
                as: 'tags',
                attributes: ['id', 'name', 'color'],
                through: {attributes: []},
                required: false,
            },
        ];

        // Enhanced search across multiple fields
        if (search) {
            const searchConditions = [
                {title: {[Op.iLike]: `%${search}%`}},
                {description: {[Op.iLike]: `%${search}%`}},
            ];

            // Include comment search if requested
            if (includeComments) {
                includeConditions.push({
                    model: sequelize.models.Comment,
                    as: 'comments',
                    attributes: [],
                    where: {content: {[Op.iLike]: `%${search}%`}},
                    required: false,
                });
                searchConditions.push({'$comments.content$': {[Op.iLike]: `%${search}%`}});
            }

            whereConditions[Op.or] = searchConditions;
        }

        // Status filtering
        if (statusFilter && statusFilter.length > 0) {
            const validStatuses = ['todo', 'in_progress', 'done'];
            const filteredStatuses = statusFilter.filter((s) => validStatuses.includes(s));
            if (filteredStatuses.length > 0) whereConditions.status = {[Op.in]: filteredStatuses};
        }

        // Priority filtering
        if (priorityFilter && priorityFilter.length > 0) {
            const validPriorities = ['low', 'medium', 'high'];
            const filteredPriorities = priorityFilter.filter((p) => validPriorities.includes(p));
            if (filteredPriorities.length > 0) whereConditions.priority = {[Op.in]: filteredPriorities};
        }

        // Tag filtering
        if (tagsFilter && tagsFilter.length > 0) {
            const tagsInclude = includeConditions.find((inc) => inc.as === 'tags');
            if (tagsInclude) {
                tagsInclude.where = {name: {[Op.in]: tagsFilter}};
                tagsInclude.required = true;
            }
        }

        // Creator filtering
        if (creator) {
            const creatorUser = await User.findOne({where: {username: creator}, attributes: ['id']});
            if (creatorUser) {
                whereConditions.createdById = creatorUser.id;
            } else {
                return errorResponse(res, 404, 'Creator user not found');
            }
        }

        // Assignee filtering
        if (assignee) {
            const assigneesInclude = includeConditions.find((inc) => inc.as === 'assignees');
            if (assigneesInclude) {
                if (assignee === 'me') {
                    assigneesInclude.where = {id: currentUserId};
                    assigneesInclude.required = true;
                } else if (assignee === 'unassigned') {
                    whereConditions['$assignees.id$'] = {[Op.is]: null};
                    assigneesInclude.required = false;
                } else {
                    const assigneeUser = await User.findOne({where: {username: assignee}, attributes: ['id']});
                    if (assigneeUser) {
                        assigneesInclude.where = {id: assigneeUser.id};
                        assigneesInclude.required = true;
                    } else {
                        return errorResponse(res, 404, 'Assignee user not found');
                    }
                }
            }
        }

        // Date range filtering
        if (dueDateFrom || dueDateTo) {
            const dueDateConditions = {};
            if (dueDateFrom) dueDateConditions[Op.gte] = new Date(dueDateFrom);
            if (dueDateTo) dueDateConditions[Op.lte] = new Date(dueDateTo);
            whereConditions.dueDate = dueDateConditions;
        }

        if (createdFrom || createdTo) {
            const createdDateConditions = {};
            if (createdFrom) createdDateConditions[Op.gte] = new Date(createdFrom);
            if (createdTo) createdDateConditions[Op.lte] = new Date(createdTo);
            whereConditions.createdAt = createdDateConditions;
        }

        // Sorting
        const validSortFields = ['title', 'dueDate', 'priority', 'createdAt', 'updatedAt', 'status'];
        const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
        const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        const {count, rows: tasks} = await Task.findAndCountAll({
            where: whereConditions,
            include: includeConditions,
            limit,
            offset,
            order: [[sortField, order]],
            distinct: true,
            subQuery: false,
            attributes: {
                include: [
                    [sequelize.literal('(SELECT COUNT(*) FROM comments WHERE comments.task_id = "Task".id)'),
                        'commentCount'],
                ],
            },
        });

        const response = createPaginatedResponse(
            tasks,
            count,
            parseInt(page || 1),
            parseInt(limit || 10),
        );

        // Add search metadata
        response.searchMetadata = {
            searchTerm: search,
            filters: {
                status: statusFilter,
                priority: priorityFilter,
                tags: tagsFilter,
                assignee,
                creator,
                dueDateRange: dueDateFrom || dueDateTo ? {from: dueDateFrom, to: dueDateTo} : null,
                createdDateRange: createdFrom || createdTo ? {from: createdFrom, to: createdTo} : null,
            },
            sorting: {field: sortField, order},
            includeComments: Boolean(includeComments),
        };

        return successResponse(res, response);
    } catch (error) {
        console.error('Advanced Search Tasks Error:', error);
        const statusCode = error.status || 400;
        return errorResponse(res, statusCode, error.message || 'Failed to search tasks');
    }
};

/**
 * Export workspace tasks to CSV format
 * @param {Object} req - Express request object
 * @param {Object} req.params - Request parameters
 * @param {string} req.params.workspaceSlug - Workspace slug
 * @param {Object} req.query - Query parameters for filtering (same as advancedSearchTasks)
 * @param {Object} req.user - Authenticated user
 * @param {Object} res - Express response object
 * @return {Object} CSV file download or error
 */
export const exportTasksCSV = async (req, res) => {
    try {
        const {workspaceSlug} = req.params;
        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug);

        // Use the same filtering logic as advanced search but without pagination
        const {
            search,
            assignee,
            creator,
            dueDateFrom,
            dueDateTo,
            createdFrom,
            createdTo,
            sortBy = 'createdAt',
            sortOrder = 'DESC',
        } = req.query;

        const statusFilter = parseQueryArray(req.query.status);
        const priorityFilter = parseQueryArray(req.query.priority);
        const currentUserId = req.user?.id;

        const whereConditions = {workspaceId};
        const includeConditions = [
            {
                model: User,
                as: 'assignees',
                attributes: ['username', 'firstName', 'lastName'],
                through: {attributes: []},
                required: false,
            },
            {
                model: User,
                as: 'creator',
                attributes: ['username', 'firstName', 'lastName'],
            },
            {
                model: Tag,
                as: 'tags',
                attributes: ['name', 'color'],
                through: {attributes: []},
                required: false,
            },
        ];

        // Apply the same filtering logic as advancedSearchTasks
        if (search) {
            whereConditions[Op.or] = [
                {title: {[Op.iLike]: `%${search}%`}},
                {description: {[Op.iLike]: `%${search}%`}},
            ];
        }

        if (statusFilter && statusFilter.length > 0) {
            const validStatuses = ['todo', 'in_progress', 'done'];
            const filteredStatuses = statusFilter.filter((s) => validStatuses.includes(s));
            if (filteredStatuses.length > 0) whereConditions.status = {[Op.in]: filteredStatuses};
        }

        if (priorityFilter && priorityFilter.length > 0) {
            const validPriorities = ['low', 'medium', 'high'];
            const filteredPriorities = priorityFilter.filter((p) => validPriorities.includes(p));
            if (filteredPriorities.length > 0) whereConditions.priority = {[Op.in]: filteredPriorities};
        }

        if (creator) {
            const creatorUser = await User.findOne({where: {username: creator}, attributes: ['id']});
            if (creatorUser) whereConditions.createdById = creatorUser.id;
        }

        if (assignee && assignee !== 'me' && assignee !== 'unassigned') {
            const assigneeUser = await User.findOne({where: {username: assignee}, attributes: ['id']});
            if (assigneeUser) {
                const assigneesInclude = includeConditions.find((inc) => inc.as === 'assignees');
                assigneesInclude.where = {id: assigneeUser.id};
                assigneesInclude.required = true;
            }
        } else if (assignee === 'me') {
            const assigneesInclude = includeConditions.find((inc) => inc.as === 'assignees');
            assigneesInclude.where = {id: currentUserId};
            assigneesInclude.required = true;
        } else if (assignee === 'unassigned') {
            whereConditions['$assignees.id$'] = {[Op.is]: null};
        }

        if (dueDateFrom || dueDateTo) {
            const dueDateConditions = {};
            if (dueDateFrom) dueDateConditions[Op.gte] = new Date(dueDateFrom);
            if (dueDateTo) dueDateConditions[Op.lte] = new Date(dueDateTo);
            whereConditions.dueDate = dueDateConditions;
        }

        if (createdFrom || createdTo) {
            const createdDateConditions = {};
            if (createdFrom) createdDateConditions[Op.gte] = new Date(createdFrom);
            if (createdTo) createdDateConditions[Op.lte] = new Date(createdTo);
            whereConditions.createdAt = createdDateConditions;
        }

        const validSortFields = ['title', 'dueDate', 'priority', 'createdAt', 'updatedAt', 'status'];
        const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
        const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        const tasks = await Task.findAll({
            where: whereConditions,
            include: includeConditions,
            order: [[sortField, order]],
            attributes: {
                include: [
                    [sequelize.literal('(SELECT COUNT(*) FROM comments WHERE comments.task_id = "Task".id)'),
                        'commentCount'],
                ],
            },
        });

        // Convert tasks to CSV format
        const csvHeader =
        'ID,Title,Description,Status,Priority,Due Date,Creator,Assignees,Tags,Comment Count,Created At,Updated At\n';
        const csvRows = tasks.map((task) => {
            const assignees = task.assignees.map((a) => `${a.firstName} ${a.lastName} (${a.username})`).join('; ');
            const creator = `${task.creator.firstName} ${task.creator.lastName} (${task.creator.username})`;
            const tags = task.tags.map((t) => t.name).join('; ');

            return [
                task.id,
                `"${task.title.replace(/"/g, '""')}"`,
                `"${(task.description || '').replace(/"/g, '""')}"`,
                task.status,
                task.priority,
                task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '',
                `"${creator}"`,
                `"${assignees}"`,
                `"${tags}"`,
                task.dataValues.commentCount || 0,
                new Date(task.createdAt).toISOString(),
                new Date(task.updatedAt).toISOString(),
            ].join(',');
        }).join('\n');

        const csvContent = csvHeader + csvRows;
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `tasks-${workspaceSlug}-${timestamp}.csv`;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csvContent);
    } catch (error) {
        console.error('Export Tasks CSV Error:', error);
        const statusCode = error.status || 500;
        return errorResponse(res, statusCode, error.message || 'Failed to export tasks to CSV');
    }
};

/**
 * Export workspace tasks to PDF format
 * @param {Object} req - Express request object
 * @param {Object} req.params - Request parameters
 * @param {string} req.params.workspaceSlug - Workspace slug
 * @param {Object} req.query - Query parameters for filtering
 * @param {Object} req.user - Authenticated user
 * @param {Object} res - Express response object
 * @return {Object} PDF file download or error
 */
export const exportTasksPDF = async (req, res) => {
    try {
        const {workspaceSlug} = req.params;
        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug);

        // Get workspace details
        const workspace = await Workspace.findByPk(workspaceId, {
            attributes: ['title', 'description'],
        });

        // Use same filtering logic as CSV export
        const {
            search,
            assignee,
            creator,
            dueDateFrom,
            dueDateTo,
            createdFrom,
            createdTo,
            sortBy = 'createdAt',
            sortOrder = 'DESC',
        } = req.query;

        const statusFilter = parseQueryArray(req.query.status);
        const priorityFilter = parseQueryArray(req.query.priority);
        const tagsFilter = parseQueryArray(req.query.tags);
        const currentUserId = req.user?.id;

        const whereConditions = {workspaceId};
        const includeConditions = [
            {
                model: User,
                as: 'assignees',
                attributes: ['username', 'firstName', 'lastName'],
                through: {attributes: []},
                required: false,
            },
            {
                model: User,
                as: 'creator',
                attributes: ['username', 'firstName', 'lastName'],
            },
            {
                model: Tag,
                as: 'tags',
                attributes: ['name', 'color'],
                through: {attributes: []},
                required: false,
            },
        ];

        // Apply filtering (same as CSV)
        if (search) {
            whereConditions[Op.or] = [
                {title: {[Op.iLike]: `%${search}%`}},
                {description: {[Op.iLike]: `%${search}%`}},
            ];
        }

        if (statusFilter && statusFilter.length > 0) {
            const validStatuses = ['todo', 'in_progress', 'done'];
            const filteredStatuses = statusFilter.filter((s) => validStatuses.includes(s));
            if (filteredStatuses.length > 0) whereConditions.status = {[Op.in]: filteredStatuses};
        }

        if (priorityFilter && priorityFilter.length > 0) {
            const validPriorities = ['low', 'medium', 'high'];
            const filteredPriorities = priorityFilter.filter((p) => validPriorities.includes(p));
            if (filteredPriorities.length > 0) whereConditions.priority = {[Op.in]: filteredPriorities};
        }

        if (tagsFilter && tagsFilter.length > 0) {
            const tagsInclude = includeConditions.find((inc) => inc.as === 'tags');
            if (tagsInclude) {
                tagsInclude.where = {name: {[Op.in]: tagsFilter}};
                tagsInclude.required = true;
            }
        }

        if (creator) {
            const creatorUser = await User.findOne({where: {username: creator}, attributes: ['id']});
            if (creatorUser) whereConditions.createdById = creatorUser.id;
        }

        if (assignee && assignee !== 'me' && assignee !== 'unassigned') {
            const assigneeUser = await User.findOne({where: {username: assignee}, attributes: ['id']});
            if (assigneeUser) {
                const assigneesInclude = includeConditions.find((inc) => inc.as === 'assignees');
                assigneesInclude.where = {id: assigneeUser.id};
                assigneesInclude.required = true;
            }
        } else if (assignee === 'me') {
            const assigneesInclude = includeConditions.find((inc) => inc.as === 'assignees');
            assigneesInclude.where = {id: currentUserId};
            assigneesInclude.required = true;
        } else if (assignee === 'unassigned') {
            whereConditions['$assignees.id$'] = {[Op.is]: null};
        }

        if (dueDateFrom || dueDateTo) {
            const dueDateConditions = {};
            if (dueDateFrom) dueDateConditions[Op.gte] = new Date(dueDateFrom);
            if (dueDateTo) dueDateConditions[Op.lte] = new Date(dueDateTo);
            whereConditions.dueDate = dueDateConditions;
        }

        if (createdFrom || createdTo) {
            const createdDateConditions = {};
            if (createdFrom) createdDateConditions[Op.gte] = new Date(createdFrom);
            if (createdTo) createdDateConditions[Op.lte] = new Date(createdTo);
            whereConditions.createdAt = createdDateConditions;
        }

        const validSortFields = ['title', 'dueDate', 'priority', 'createdAt', 'updatedAt', 'status'];
        const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
        const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        const tasks = await Task.findAll({
            where: whereConditions,
            include: includeConditions,
            order: [[sortField, order]],
            attributes: {
                include: [
                    [sequelize.literal('(SELECT COUNT(*) FROM comments WHERE comments.task_id = "Task".id)'),
                        'commentCount'],
                ],
            },
        });

        // Generate HTML content for PDF
        const timestamp = new Date().toLocaleString();
        const statusColors = {
            'todo': '#6b7280',
            'in_progress': '#f59e0b',
            'done': '#10b981',
        };
        const priorityColors = {
            'low': '#10b981',
            'medium': '#f59e0b',
            'high': '#ef4444',
        };

        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Tasks Report - ${workspace.title}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .header { border-bottom: 2px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 30px; }
                .header h1 { color: #1f2937; margin: 0; }
                .header .subtitle { color: #6b7280; margin-top: 5px; }
                .stats { background: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
                .task { border: 1px solid #e5e7eb; margin-bottom: 15px; border-radius: 8px; padding: 15px; }
                .task-header { display: flex; justify-content: space-between; margin-bottom: 10px; }
                .task-title { font-weight: bold; font-size: 16px; color: #1f2937; }
                .task-meta { font-size: 12px; color: #6b7280; }
                .status,
                .priority,
                .tag { 
                    padding: 4px 8px; 
                    border-radius: 4px; 
                    font-size: 12px; 
                    font-weight: bold; 
                    color: white; 
                    margin-right: 4px; 
                }
                .description { margin: 10px 0; color: #4b5563; }
                .assignees { font-size: 14px; color: #6b7280; }
                .footer { margin-top: 30px; text-align: center; color: #9ca3af; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Tasks Report</h1>
                <div class="subtitle">Workspace: ${workspace.title}</div>
                <div class="subtitle">Generated: ${timestamp}</div>
            </div>
            
            <div class="stats">
                <strong>Summary:</strong> ${tasks.length} tasks found
            </div>

            ${tasks.map((task) => {
        const assignees = task.assignees.map((a) => `${a.firstName} ${a.lastName}`).join(', ') || 'Unassigned';
        const creator = `${task.creator.firstName} ${task.creator.lastName}`;
        const tags = task.tags.map((tag) =>
            `<span class="tag" style="background-color: ${tag.color}">${tag.name}</span>`,
        ).join('');

        return `
                <div class="task">
                    <div class="task-header">
                        <div class="task-title">${task.title}</div>
                        <div class="task-meta">ID: ${task.id}</div>
                    </div>
                    <div style="margin-bottom: 10px;">
                        <span class="status" style="background-color: ${statusColors[task.status]}">
                            ${task.status.replace('_', ' ').toUpperCase()}
                        </span>
                        <span class="priority" style="background-color: ${priorityColors[task.priority]}">
                            ${task.priority.toUpperCase()}
                        </span>
                        ${tags}
                    </div>
                    ${task.description ? `<div class="description">${task.description}</div>` : ''}
                    <div class="assignees"><strong>Assignees:</strong> ${assignees}</div>
                    <div class="assignees"><strong>Creator:</strong> ${creator}</div>
                    <div class="assignees">
                        <strong>Due Date:</strong> 
                        ${task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'Not set'}
                    </div>
                    <div class="assignees"><strong>Comments:</strong> ${task.dataValues.commentCount || 0}</div>
                    <div class="assignees">
                        <strong>Created:</strong> 
                        ${new Date(task.createdAt).toLocaleDateString()}
                    </div>
                </div>
                `;
    }).join('')}

            <div class="footer">
                Task Management System Report
            </div>
        </body>
        </html>
        `;

        // For now, return HTML that can be converted to PDF by the client
        // In production, you might want to use puppeteer or similar to generate actual PDF
        const timestampFile = new Date().toISOString().split('T')[0];
        const filename = `tasks-${workspaceSlug}-${timestampFile}.html`;

        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(htmlContent);
    } catch (error) {
        console.error('Export Tasks PDF Error:', error);
        const statusCode = error.status || 500;
        return errorResponse(res, statusCode, error.message || 'Failed to export tasks to PDF');
    }
};
