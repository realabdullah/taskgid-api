/* eslint-disable require-jsdoc */
import Task from '../models/Task.js';
import User from '../models/User.js';
import {Workspace} from '../models/Workspace.js';
import TaskAssignee from '../models/TaskAssignee.js';
import {logWorkspaceActivity, logTaskActivity} from '../utils/activityLogger.js';
import {errorResponse, successResponse} from '../utils/responseUtils.js';
import notificationService from '../services/notificationService.js';
import 'dotenv/config';
import {getPaginationParams, createPaginatedResponse} from '../utils/pagination.js';
import {Op} from 'sequelize';
import TaskActivity from '../models/TaskActivity.js';
import {NOTIFICATION_TYPES} from '../constants/notificationTypes.js';
import sequelize from '../config/database.js';

const getAssignee = async (assigneeUsername) => {
    if (!assigneeUsername) return null;
    const user = await User.findOne({where: {username: assigneeUsername}, attributes: ['id']});
    return user ? user.id : null;
};

const getAssignees = async (assigneeUsernames) => {
    if (!assigneeUsernames || !assigneeUsernames.length) return [];

    const assigneeIds = [];
    for (const username of assigneeUsernames) {
        const userId = await getAssignee(username);
        if (userId) assigneeIds.push(userId);
    }

    return assigneeIds;
};

const getWorkspaceIdFromSlug = async (slug) => {
    const workspace = await Workspace.findOne({where: {slug}, attributes: ['id']});
    if (!workspace) {
        // eslint-disable-next-line no-throw-literal
        throw {status: 404, message: 'Workspace not found'};
    }
    return workspace.id;
};

const parseQueryArray = (queryParam) => {
    if (!queryParam) return undefined;
    if (Array.isArray(queryParam)) return queryParam.filter((item) => item.trim() !== '');
    return queryParam.split(',').map((item) => item.trim()).filter((item) => item.trim() !== '');
};


export const addTask = async (req, res) => {
    try {
        const {workspaceSlug} = req.params;
        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug);

        const {title, description, status, priority, dueDate, assignees} = req.body;
        const assigneeIds = await getAssignees(assignees);

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

export const updateTask = async (req, res) => {
    try {
        const {workspaceSlug, id: taskId} = req.params;
        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug);

        const updateData = req.body;
        const newAssigneeIds = updateData.assignees ? await getAssignees(updateData.assignees) : undefined;

        const task = await Task.findOne({
            where: {
                id: taskId,
                workspaceId,
            },
            include: [{
                model: User,
                as: 'assignees',
                attributes: ['id'],
            }],
        });

        if (!task) {
            return errorResponse(res, 404, 'Task not found in this workspace');
        }

        const originalData = task.get({plain: true});
        const originalAssigneeIds = originalData.assignees.map((assignee) => assignee.id);

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

        const updatedTask = await Task.findByPk(task.id, {
            include: [
                {
                    model: User,
                    as: 'assignees',
                    attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
                    through: {attributes: []},
                },
                {model: User, as: 'creator', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture']},
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

export const deleteTask = async (req, res) => {
    try {
        const {workspaceSlug, id: taskId} = req.params;
        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug);

        const task = await Task.findOne({where: {id: taskId, workspaceId}});
        if (!task) return errorResponse(res, 404, 'Task not found in this workspace');

        const meta = {taskId: task.id, taskTitle: task.title};

        await TaskAssignee.destroy({where: {taskId: task.id}});
        await task.destroy();

        await logTaskActivity(task.id, req.user.id, 'deleted', meta);
        await logWorkspaceActivity(workspaceId, req.user.id, 'task_deleted', meta);

        return successResponse(res, {message: 'Task deleted successfully'});
    } catch (error) {
        console.error('Delete Task Error:', error);
        const statusCode = error.status || 400;
        return errorResponse(res, statusCode, error.message || 'Failed to delete task');
    }
};


export const fetchWorkspaceTasks = async (req, res) => {
    try {
        const {workspaceSlug} = req.params;
        const {page, limit, offset} = getPaginationParams(req.query);

        const {search, assignee} = req.query;
        const statusFilter = parseQueryArray(req.query.status);
        const priorityFilter = parseQueryArray(req.query.priority);
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
