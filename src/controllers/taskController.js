/* eslint-disable require-jsdoc */
import Task from '../models/Task.js';
import User from '../models/User.js';
import {Workspace} from '../models/Workspace.js';
import 'dotenv/config';
import {getPaginationParams, createPaginatedResponse} from '../utils/pagination.js';

// Define response helpers locally (assuming they are not globally available)
const errorResponse = (res, status, message) => res.status(status).json({error: message, success: false});
const successResponse = (res, data, statusCode = 200) => res.status(statusCode).json({...data, success: true});


// Helper to find user by username for assignee lookup
const getAssignee = async (assigneeUsername) => {
    if (!assigneeUsername) return null;
    const user = await User.findOne({where: {username: assigneeUsername}, attributes: ['id']});
    return user ? user.id : null;
};

// Helper to find workspace ID from slug and handle errors
async function getWorkspaceIdFromSlug(slug) {
    const workspace = await Workspace.findOne({where: {slug}, attributes: ['id']});
    if (!workspace) {
        // eslint-disable-next-line no-throw-literal
        throw {status: 404, message: 'Workspace not found'}; // Throw custom error object
    }
    return workspace.id;
}


export const addTask = async (req, res) => {
    try {
        const {workspaceSlug} = req.params; // Get slug from route params
        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug); // Find workspace ID

        // Removed workspaceId from body destructuring
        const {title, description, status, priority, dueDate, assignee} = req.body;
        const assigneeId = await getAssignee(assignee);

        const task = await Task.create({
            title,
            description,
            status,
            priority,
            dueDate,
            assigneeId,
            userId: req.user.id, // Assuming auth middleware provides req.user.id
            workspaceId, // Use the retrieved workspaceId
        });

        // Refetch to include associations
        const populatedTask = await Task.findByPk(task.id, {
            include: [
                {
                    model: User,
                    as: 'assignee',
                    attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
                },
                {model: User, as: 'user', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture']},
            ],
        });

        return successResponse(res, populatedTask, 201); // Use successResponse helper
    } catch (error) {
        console.error('Add Task Error:', error);
        const statusCode = error.status || 400; // Use status from custom error or default to 400
        return errorResponse(res, statusCode, error.message || 'Failed to add task');
    }
};

export const updateTask = async (req, res) => {
    try {
        const {workspaceSlug, id: taskId} = req.params; // Get slug and task ID
        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug); // Find workspace ID

        // Removed workspaceId from body destructuring
        const {title, description, status, priority, dueDate, assignee} = req.body;
        const assigneeId = await getAssignee(assignee);

        // Find the task within the specific workspace
        // We assume checkMemberMiddleware already verified user has access to workspaceSlug
        const task = await Task.findOne({
            where: {
                id: taskId,
                workspaceId, // Ensure task belongs to the correct workspace
            },
        });

        if (!task) {
            // If task doesn't exist in this workspace, return 404
            return errorResponse(res, 404, 'Task not found in this workspace');
        }

        // Optional: Add check if req.user.id === task.userId or if user has specific update permissions

        await task.update({
            title,
            description,
            status,
            priority,
            dueDate,
            assigneeId,
        });

        // Refetch to include associations
        const updatedTask = await Task.findByPk(task.id, {
            include: [
                {
                    model: User,
                    as: 'assignee',
                    attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
                },
                {model: User, as: 'user', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture']},
            ],
        });

        return successResponse(res, updatedTask); // Use successResponse helper
    } catch (error) {
        console.error('Update Task Error:', error);
        const statusCode = error.status || 400; // Use status from custom error or default to 400
        return errorResponse(res, statusCode, error.message || 'Failed to update task');
    }
};

export const fetchWorkspaceTask = async (req, res) => {
    try {
        const {workspaceSlug, id: taskId} = req.params; // Get slug and task ID
        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug); // Find workspace ID

        // We assume checkMemberMiddleware already verified user has access to workspaceSlug

        const task = await Task.findOne({
            where: {
                id: taskId,
                workspaceId, // Ensure task belongs to the correct workspace
            },
            include: [
                {
                    model: User,
                    as: 'assignee',
                    attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
                },
                {model: User, as: 'user', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture']},
            ],
        });

        if (!task) {
            return errorResponse(res, 404, 'Task not found in this workspace');
        }

        return successResponse(res, task); // Use successResponse helper
    } catch (error) {
        console.error('Fetch Task Error:', error);
        const statusCode = error.status || 400; // Use status from custom error or default to 400
        return errorResponse(res, statusCode, error.message || 'Failed to fetch task');
    }
};

export const deleteTask = async (req, res) => {
    try {
        const {workspaceSlug, id: taskId} = req.params; // Get slug and task ID
        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug); // Find workspace ID

        // We assume checkMemberMiddleware already verified user has access to workspaceSlug

        const task = await Task.findOne({
            where: {
                id: taskId,
                workspaceId, // Ensure task belongs to the correct workspace
            },
        });

        if (!task) {
            return errorResponse(res, 404, 'Task not found in this workspace');
        }

        // Optional: Add check if req.user.id === task.userId or if user has specific delete permissions

        await task.destroy();
        return successResponse(res, {message: 'Task deleted successfully'}); // Use successResponse helper
    } catch (error) {
        console.error('Delete Task Error:', error);
        const statusCode = error.status || 400; // Use status from custom error or default to 400
        return errorResponse(res, statusCode, error.message || 'Failed to delete task');
    }
};


export const fetchWorkspaceTasks = async (req, res) => {
    try {
        const {workspaceSlug} = req.params; // Use slug from params
        const {page, limit, offset} = getPaginationParams(req.query); // Pagination from query

        const workspaceId = await getWorkspaceIdFromSlug(workspaceSlug); // Find workspace ID

        // We assume checkMemberMiddleware already verified user has access to workspaceSlug

        const {count, rows: tasks} = await Task.findAndCountAll({
            where: {workspaceId}, // Filter by the retrieved workspaceId
            include: [
                {
                    model: User,
                    as: 'assignee',
                    attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
                },
                {model: User, as: 'user', attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture']},
            ],
            limit,
            offset,
            order: [['createdAt', 'DESC']],
        });

        // Use the standard pagination response creator
        const response = createPaginatedResponse(
            tasks,
            count,
            parseInt(page || 1),
            parseInt(limit || 10),
        ); // Pass page/limit
        return successResponse(res, response); // Use successResponse helper
    } catch (error) {
        console.error('Fetch Tasks Error:', error);
        const statusCode = error.status || 400; // Use status from custom error or default to 400
        return errorResponse(res, statusCode, error.message || 'Failed to fetch tasks');
    }
};
