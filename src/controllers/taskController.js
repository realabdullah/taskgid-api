/* eslint-disable require-jsdoc */
import Task from '../models/Task.js';
import User from '../models/User.js';
import {Workspace} from '../models/Workspace.js';
import TaskAssignee from '../models/TaskAssignee.js';
import {logWorkspaceActivity, logTaskActivity} from '../utils/activityLogger.js';
import 'dotenv/config';
import {getPaginationParams, createPaginatedResponse} from '../utils/pagination.js';
import {Op} from 'sequelize';

const errorResponse = (res, status, error) => res.status(status).json({error: error, success: false});
const successResponse = (res, data, statusCode = 200) => res.status(statusCode).json({...data, success: true});


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

async function getWorkspaceIdFromSlug(slug) {
    const workspace = await Workspace.findOne({where: {slug}, attributes: ['id']});
    if (!workspace) {
        // eslint-disable-next-line no-throw-literal
        throw {status: 404, message: 'Workspace not found'};
    }
    return workspace.id;
}


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

        const {title, description, status, priority, dueDate, assignees} = req.body;
        const newAssigneeIds = await getAssignees(assignees);

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

        const updatePayload = {};
        if (title !== undefined) updatePayload.title = title;
        if (description !== undefined) updatePayload.description = description;
        if (status !== undefined) updatePayload.status = status;
        if (priority !== undefined) updatePayload.priority = priority;
        if (dueDate !== undefined) updatePayload.dueDate = dueDate;

        if (Object.keys(updatePayload).length > 0) await task.update(updatePayload);

        if (updatePayload.status !== undefined && originalData.status !== updatePayload.status) {
            const meta = {
                taskId: task.id,
                taskTitle: task.title,
                changeDetails: {field: 'status', from: originalData.status, to: updatePayload.status},
            };
            await logTaskActivity(task.id, req.user.id, 'status_changed', meta);
            await logWorkspaceActivity(workspaceId, req.user.id, 'task_updated', meta);
        }

        if (updatePayload.priority !== undefined && originalData.priority !== updatePayload.priority) {
            const meta = {
                taskId: task.id,
                taskTitle: task.title,
                changeDetails: {field: 'priority', from: originalData.priority, to: updatePayload.priority},
            };
            await logTaskActivity(task.id, req.user.id, 'priority_changed', meta);
            await logWorkspaceActivity(workspaceId, req.user.id, 'task_updated', meta);
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
        }

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

        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug);

        const {count, rows: tasks} = await Task.findAndCountAll({
            where: {workspaceId},
            include: [
                {
                    model: User,
                    as: 'assignees',
                    attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
                    through: {attributes: []},
                },
                {model: User, as: 'creator', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture']},
            ],
            limit,
            offset,
            order: [['createdAt', 'DESC']],
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
