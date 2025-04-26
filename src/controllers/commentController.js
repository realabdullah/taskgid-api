/* eslint-disable require-jsdoc */
import Comment from '../models/Comment.js';
import User from '../models/User.js';
import Task from '../models/Task.js';
import {Workspace} from '../models/Workspace.js';
import {getPaginationParams, createPaginatedResponse} from '../utils/pagination.js';
import {sendMentionNotification} from '../utils/pusherService.js';
import {Op} from 'sequelize';
import 'dotenv/config';

const findMentionedUsersInWorkspace = async (usernames, workspaceId) => {
    if (!usernames || usernames.length === 0) {
        return [];
    }
    return await User.findAll({
        where: {
            username: {
                [Op.in]: usernames,
            },
        },
        include: [{
            model: Workspace,
            as: 'workspaces',
            where: {id: workspaceId},
            attributes: [],
            required: true,
        }],
        attributes: ['id', 'username', 'firstName'],
    });
};

const processMentionsAndNotify = async (comment, authorUser, taskId) => {
    const mentionRegex = /@(\w+)/g;
    const content = comment.content || '';
    const mentionedUsernames = new Set();
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
        mentionedUsernames.add(match[1]);
    }

    if (mentionedUsernames.size === 0) {
        return;
    }

    try {
        const task = await Task.findByPk(taskId, {
            include: [{
                model: Workspace,
                as: 'workspace',
                attributes: ['id', 'title'],
            }],
            attributes: ['id', 'title', 'workspaceId'],
        });

        if (!task || !task.workspace) {
            console.error(`Task or Workspace not found for comment ${comment.id}, cannot process mentions.`);
            return;
        }

        const workspaceId = task.workspace.id;
        const mentionedUsers = await findMentionedUsersInWorkspace([...mentionedUsernames], workspaceId);

        mentionedUsers.forEach((mentionedUser) => {
            if (mentionedUser.id !== authorUser.id) {
                sendMentionNotification(
                    mentionedUser.id,
                    comment,
                    authorUser,
                    task,
                    task.workspace,
                );
            }
        });
    } catch (error) {
        console.error(`Error processing mentions for comment ${comment.id}:`, error);
    }
};

export const getTaskComments = async (req, res) => {
    try {
        const {id} = req.params;
        const {page, limit, offset} = getPaginationParams(req.query);

        const {count, rows: comments} = await Comment.findAndCountAll({
            where: {taskId: id},
            include: [{
                model: User,
                as: 'user',
                attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
            }],
            limit,
            offset,
            order: [['createdAt', 'DESC']],
        });

        const response = createPaginatedResponse(comments, count, page, limit);
        res.json(response);
    } catch (error) {
        console.error('Error fetching comments:', error);
        res.status(500).json({success: false, error: 'Failed to fetch comments'});
    }
};

export const addTaskComment = async (req, res) => {
    try {
        const content = req.body.content;
        const taskId = req.body.taskId;
        const userId = req.user.id;

        if (!content || !taskId) {
            return res.status(400).json({success: false, error: 'Comment content and taskId are required'});
        }

        const comment = await Comment.create({
            content,
            taskId,
            userId,
        });

        const populatedComment = await Comment.findByPk(comment.id, {
            include: [{
                model: User,
                as: 'user',
                attributes: ['id', 'username', 'firstName', 'lastName', 'profilePicture'],
            }],
        });

        processMentionsAndNotify(populatedComment, req.user, taskId).catch((err) => {
            console.error('Async mention processing failed:', err);
        });

        res.status(201).json({success: true, comment: populatedComment});
    } catch (error) {
        console.error('Error adding comment:', error);
        res.status(500).json({success: false, error: 'Failed to add comment'});
    }
};
