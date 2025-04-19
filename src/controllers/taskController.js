/* eslint-disable require-jsdoc */
import Task from '../models/Task.js';
import User from '../models/User.js';
import {Workspace} from '../models/Workspace.js';
import 'dotenv/config';
import {getPaginationParams, createPaginatedResponse} from '../utils/pagination.js';

const getAssignee = async (assignee) => {
    const user = await User.findOne({where: {username: assignee}});
    return user ? user.id : null;
};

export const addTask = async (req, res) => {
    try {
        const {title, description, status, priority, dueDate, assignee, workspaceId} = req.body;
        const assigneeId = await getAssignee(assignee);

        const task = await Task.create({
            title,
            description,
            status,
            priority,
            dueDate,
            assigneeId,
            userId: req.user.id,
            workspaceId,
        });

        const populatedTask = await Task.findByPk(task.id, {
            include: [
                {model: User, as: 'assignee', attributes: ['username', 'firstName', 'lastName', 'profilePicture']},
                {model: User, as: 'user', attributes: ['username', 'firstName', 'lastName', 'profilePicture']},
            ],
        });

        res.status(201).json(populatedTask);
    } catch (error) {
        res.status(400).json({error: error.message});
    }
};

export const updateTask = async (req, res) => {
    try {
        const {id} = req.params;
        const {title, description, status, priority, dueDate, assignee, workspaceId} = req.body;
        const assigneeId = await getAssignee(assignee);

        const task = await Task.findOne({
            where: {
                id,
                userId: req.user.id,
                workspaceId,
            },
        });

        if (!task) {
            return res.status(404).json({error: 'Task not found'});
        }

        await task.update({
            title,
            description,
            status,
            priority,
            dueDate,
            assigneeId,
        });

        const updatedTask = await Task.findByPk(task.id, {
            include: [
                {model: User, as: 'assignee', attributes: ['username', 'firstName', 'lastName', 'profilePicture']},
                {model: User, as: 'user', attributes: ['username', 'firstName', 'lastName', 'profilePicture']},
            ],
        });

        res.json(updatedTask);
    } catch (error) {
        res.status(400).json({error: error.message});
    }
};

export const fetchWorkspaceTask = async (req, res) => {
    try {
        const {id} = req.params;
        const {workspaceId} = req.query;

        const workspace = await Workspace.findByPk(workspaceId, {
            include: [{model: User, as: 'user'}],
        });

        if (!workspace) {
            return res.status(404).json({error: 'Workspace not found'});
        }

        const user = await User.findByPk(req.user.id);
        if (workspace.userId !== user.id) {
            return res.status(403).json({error: 'Not authorized to access this workspace'});
        }

        const task = await Task.findOne({
            where: {
                id,
                userId: user.id,
                workspaceId,
            },
            include: [
                {model: User, as: 'assignee', attributes: ['username', 'firstName', 'lastName', 'profilePicture']},
                {model: User, as: 'user', attributes: ['username', 'firstName', 'lastName', 'profilePicture']},
            ],
        });

        if (!task) {
            return res.status(404).json({error: 'Task not found'});
        }

        res.json(task);
    } catch (error) {
        res.status(400).json({error: error.message});
    }
};

export const deleteTask = async (req, res) => {
    try {
        const {id} = req.params;
        const {workspaceId} = req.query;

        const task = await Task.findOne({
            where: {
                id,
                userId: req.user.id,
                workspaceId,
            },
        });

        if (!task) {
            return res.status(404).json({error: 'Task not found'});
        }

        await task.destroy();
        res.json({message: 'Task deleted successfully'});
    } catch (error) {
        res.status(400).json({error: error.message});
    }
};

export const fetchWorkspaceTasks = async (req, res) => {
    try {
        const {slug} = req.params;
        const {page, limit, offset} = getPaginationParams(req.query);

        const workspace = await Workspace.findOne({
            where: {slug},
        });

        if (!workspace) {
            return res.status(404).json({error: 'Workspace not found', success: false});
        }

        const {count, rows: tasks} = await Task.findAndCountAll({
            where: {workspaceId: workspace.id},
            include: [
                {model: User, as: 'assignee', attributes: ['username', 'firstName', 'lastName', 'profilePicture']},
                {model: User, as: 'user', attributes: ['username', 'firstName', 'lastName', 'profilePicture']},
            ],
            limit,
            offset,
            order: [['createdAt', 'DESC']],
        });

        const response = createPaginatedResponse(tasks, count, page, limit, 'tasks');
        res.json(response);
    } catch (error) {
        res.status(400).json({error: error.message, success: false});
    }
};
