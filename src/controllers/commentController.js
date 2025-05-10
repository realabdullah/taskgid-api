/* eslint-disable require-jsdoc */
import sequelize from '../config/database.js';
import Comment from '../models/Comment.js';
import User from '../models/User.js';
import Task from '../models/Task.js';
import {Workspace} from '../models/Workspace.js';
import {notificationHandler} from '../services/notificationService.js';
import {
    getPaginationParams,
    createPaginatedResponse,
} from '../utils/pagination.js';
import {Op} from 'sequelize';
import 'dotenv/config';
import CommentLike from '../models/CommentLike.js';

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
        include: [
            {
                model: Workspace,
                as: 'workspaces',
                where: {id: workspaceId},
                attributes: [],
                required: true,
            },
        ],
        attributes: ['id', 'username', 'firstName'],
    });
};

const updateMentionsInComment = async (
    commentInstance,
    authorUser,
    taskIdForContext,
) => {
    const mentionRegex = /@(\w+)/g;
    const content = commentInstance.content || '';
    const mentionedUsernames = new Set();
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
        mentionedUsernames.add(match[1]);
    }

    const mentionedUsernameArray = [...mentionedUsernames];
    let mentionedUserIds = [];

    if (mentionedUsernameArray.length > 0) {
        try {
            const task = await Task.findByPk(taskIdForContext, {
                include: [
                    {
                        model: Workspace,
                        as: 'workspace',
                        attributes: ['id'],
                    },
                ],
                attributes: ['id', 'workspaceId', 'title'],
            });
            if (task && task.workspace) {
                const mentionedUsers = await findMentionedUsersInWorkspace(
                    mentionedUsernameArray,
                    task.workspace.id,
                );
                mentionedUserIds = mentionedUsers.map((user) => user.id);

                // Send notifications to mentioned users
                for (const mentionedUser of mentionedUsers) {
                    if (mentionedUser.id !== authorUser.id) {
                        await notificationHandler.sendMentionNotification(
                            mentionedUser.id,
                            authorUser.id,
                            authorUser.firstName || authorUser.username,
                            commentInstance.id,
                            'comment',
                        );
                    }
                }
            }
        } catch (error) {
            console.error(
                `Error processing mentions for comment ${commentInstance.id} during update:`,
                error,
            );
        }
    }
    await commentInstance.update({mentions: mentionedUserIds});
    return commentInstance;
};

export const getTaskComments = async (req, res) => {
    try {
        const {id} = req.params;
        const {page, limit, offset} = getPaginationParams(req.query);

        const {count, rows: comments} = await Comment.findAndCountAll({
            where: {taskId: id, parentId: null},
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: [
                        'id',
                        'username',
                        'firstName',
                        'lastName',
                        'profilePicture',
                    ],
                },
            ],
            limit,
            offset,
            order: [['createdAt', 'ASC']],
        });

        const response = createPaginatedResponse(comments, count, page, limit);
        res.json(response);
    } catch (error) {
        console.error('Error fetching task comments:', error);
        res
            .status(500)
            .json({success: false, error: 'Failed to fetch task comments'});
    }
};

export const getCommentReplies = async (req, res) => {
    try {
        const {id: taskId, commentId} = req.params;
        const {page, limit, offset} = getPaginationParams(req.query);

        const parentComment = await Comment.findByPk(commentId);
        if (!parentComment) {
            return res.status(404).json({success: false, error: 'Parent comment not found'});
        }

        if (parentComment.taskId !== taskId) {
            return res
                .status(403)
                .json({success: false, error: 'Parent comment does not belong to the specified task'});
        }

        const {count, rows: replies} = await Comment.findAndCountAll({
            where: {parentId: commentId},
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: [
                        'id',
                        'username',
                        'firstName',
                        'lastName',
                        'profilePicture',
                    ],
                },
            ],
            limit,
            offset,
            order: [['createdAt', 'ASC']],
        });

        const response = createPaginatedResponse(replies, count, page, limit);
        res.json(response);
    } catch (error) {
        console.error('Error fetching comment replies:', error);
        res
            .status(500)
            .json({success: false, error: 'Failed to fetch comment replies'});
    }
};

export const addTaskComment = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const {taskId} = req.params;
        const {content, parentId} = req.body;
        const userId = req.user.id;

        if (!content || !taskId) {
            await t.rollback();
            return res
                .status(400)
                .json({
                    success: false,
                    error: 'Comment content and taskId are required',
                });
        }

        let parentComment = null;
        if (parentId) {
            parentComment = await Comment.findOne({
                where: {id: parentId, taskId: taskId},
                transaction: t,
            });
            if (!parentComment) {
                await t.rollback();
                return res
                    .status(404)
                    .json({
                        success: false,
                        error: 'Parent comment not found or does not belong to this task',
                    });
            }
        }

        let comment = await Comment.create(
            {
                content,
                taskId,
                userId,
                parentId,
            },
            {transaction: t},
        );

        if (parentComment) {
            await parentComment.increment('replyCount', {transaction: t});
        }

        comment = await updateMentionsInComment(comment, req.user, taskId);

        const populatedComment = await Comment.findByPk(comment.id, {
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: [
                        'id',
                        'username',
                        'firstName',
                        'lastName',
                        'profilePicture',
                    ],
                },
            ],
            transaction: t,
        });

        // Get task details for notification
        const task = await Task.findByPk(taskId, {
            include: [
                {
                    model: User,
                    as: 'assignees',
                    attributes: ['id'],
                },
                {
                    model: User,
                    as: 'creator',
                    attributes: ['id'],
                },
            ],
            transaction: t,
        });

        // Get users to notify (assignees, creator, and parent comment author if it's a reply)
        const usersToNotify = new Set([
            ...task.assignees.map((a) => a.id),
            task.createdById,
        ]);

        if (parentComment) {
            usersToNotify.add(parentComment.userId);
        }

        // Remove the comment author from the notification list
        usersToNotify.delete(userId);

        // Send notifications to all relevant users
        if (usersToNotify.size > 0) {
            await notificationHandler.sendCommentNotification(
                taskId,
                task.title,
                comment.id,
                userId,
                req.user.firstName || req.user.username,
                Array.from(usersToNotify),
            );
        }

        await t.commit();
        return res.status(201).json({
            success: true,
            data: populatedComment.toJSON(),
        });
    } catch (error) {
        await t.rollback();
        console.error('Add Comment Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to add comment',
        });
    }
};

export const updateComment = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const {id: taskId, commentId} = req.params;
        const {content} = req.body;
        const userId = req.user.id;

        if (!content) {
            await t.rollback();
            return res
                .status(400)
                .json({success: false, error: 'Content is required'});
        }

        const comment = await Comment.findByPk(commentId, {transaction: t});

        if (!comment) {
            await t.rollback();
            return res
                .status(404)
                .json({success: false, error: 'Comment not found'});
        }

        if (comment.taskId !== taskId) {
            await t.rollback();
            return res.status(403).json({success: false, error: 'Comment does not belong to the specified task'});
        }

        if (comment.userId !== userId) {
            await t.rollback();
            return res
                .status(403)
                .json({
                    success: false,
                    error: 'You are not authorized to update this comment',
                });
        }

        comment.content = content;
        await comment.save({transaction: t});

        const updatedCommentWithMentions = await updateMentionsInComment(
            comment,
            req.user,
            comment.taskId,
        );

        const populatedComment = await Comment.findByPk(
            updatedCommentWithMentions.id,
            {
                include: [
                    {
                        model: User,
                        as: 'user',
                        attributes: [
                            'id',
                            'username',
                            'firstName',
                            'lastName',
                            'profilePicture',
                        ],
                    },
                ],
                transaction: t,
            },
        );

        await t.commit();
        res.json({success: true, comment: populatedComment});
    } catch (error) {
        await t.rollback();
        console.error('Error updating comment:', error);
        res.status(500).json({success: false, error: 'Failed to update comment'});
    }
};

export const deleteComment = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const {id: taskId, commentId} = req.params;
        const userId = req.user.id;

        const comment = await Comment.findByPk(commentId, {
            include: [{model: Comment, as: 'parent'}],
            transaction: t,
        });

        if (!comment) {
            await t.rollback();
            return res
                .status(404)
                .json({success: false, error: 'Comment not found'});
        }

        if (comment.taskId !== taskId) {
            await t.rollback();
            return res.status(403).json({success: false, error: 'Comment does not belong to the specified task'});
        }

        if (comment.userId !== userId) {
            await t.rollback();
            return res
                .status(403)
                .json({
                    success: false,
                    error: 'You are not authorized to delete this comment',
                });
        }

        await comment.destroy({transaction: t});

        if (comment.parentId && comment.parent) {
            await comment.parent.decrement('replyCount', {transaction: t});
        }

        await t.commit();
        res
            .status(200)
            .json({success: true, message: 'Comment deleted successfully'});
    } catch (error) {
        await t.rollback();
        console.error('Error deleting comment:', error);
        res.status(500).json({success: false, error: 'Failed to delete comment'});
    }
};

export const likeComment = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const {id: taskId, commentId} = req.params;
        const userId = req.user.id;

        const comment = await Comment.findByPk(commentId, {transaction: t});

        if (!comment) {
            await t.rollback();
            return res.status(404).json({success: false, error: 'Comment not found'});
        }

        if (comment.taskId !== taskId) {
            await t.rollback();
            return res.status(403).json({success: false, error: 'Comment does not belong to the specified task'});
        }

        // Check if user has already liked the comment
        const existingLike = await CommentLike.findOne({
            where: {
                commentId,
                userId,
            },
            transaction: t,
        });

        if (existingLike) {
            await t.rollback();
            return res.status(400).json({success: false, error: 'You have already liked this comment'});
        }

        // Create the like and increment the like count atomically
        await Promise.all([
            CommentLike.create({
                commentId,
                userId,
            }, {transaction: t}),
            comment.increment('likeCount', {transaction: t}),
        ]);

        await t.commit();
        res.status(201).json({success: true, message: 'Comment liked successfully'});
    } catch (error) {
        await t.rollback();
        console.error('Error liking comment:', error);
        res.status(500).json({success: false, error: 'Failed to like comment'});
    }
};

export const unlikeComment = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const {id: taskId, commentId} = req.params;
        const userId = req.user.id;

        const comment = await Comment.findByPk(commentId, {transaction: t});

        if (!comment) {
            await t.rollback();
            return res.status(404).json({success: false, error: 'Comment not found'});
        }

        if (comment.taskId !== taskId) {
            await t.rollback();
            return res.status(403).json({success: false, error: 'Comment does not belong to the specified task'});
        }

        // Check if user has liked the comment
        const existingLike = await CommentLike.findOne({
            where: {
                commentId,
                userId,
            },
            transaction: t,
        });

        if (!existingLike) {
            await t.rollback();
            return res.status(400).json({success: false, error: 'You have not liked this comment'});
        }

        // Delete the like and decrement the like count atomically
        await Promise.all([
            existingLike.destroy({transaction: t}),
            comment.decrement('likeCount', {transaction: t}),
        ]);

        await t.commit();
        res.status(200).json({success: true, message: 'Comment unliked successfully'});
    } catch (error) {
        await t.rollback();
        console.error('Error unliking comment:', error);
        res.status(500).json({success: false, error: 'Failed to unlike comment'});
    }
};
