/* eslint-disable require-jsdoc */
import "dotenv/config";
import { Op } from "sequelize";
import sequelize from "../config/database.js";
import { NOTIFICATION_TYPES } from "../constants/notificationTypes.js";
import Comment from "../models/Comment.js";
import CommentLike from "../models/CommentLike.js";
import TaskRead from "../models/TaskRead.js";
import Task from "../models/Task.js";
import User from "../models/User.js";
import { Workspace } from "../models/Workspace.js";
import notificationService from "../services/notificationService.js";
import {
  createPaginatedResponse,
  getPaginationParams,
} from "../utils/pagination.js";
import { sanitizeRichText } from "../utils/sanitizer.js";
import {
  emitWorkspaceEvent,
  WORKSPACE_EVENTS,
} from "../services/workspaceEvents.js";
import {
  persistWorkspaceEvent,
  queueDeliveriesForEvent,
  dispatchQueuedDeliveries,
} from "../services/webhookService.js";

/**
 * Marks which of the given comments the requesting user has already liked, so a
 * client can render the toggle in the right state without a request per comment.
 * @param {Array<Object>} comments - Comment instances from a findAll/findAndCountAll.
 * @param {string} userId - The requesting user's id.
 * @return {Promise<Array<Object>>} Plain comment objects with `likedByMe` set.
 */
const withLikedByMe = async (comments, userId) => {
  const plain = comments.map((comment) => comment.toJSON());
  if (!userId || plain.length === 0) {
    return plain.map((comment) => ({ ...comment, likedByMe: false }));
  }

  const likes = await CommentLike.findAll({
    where: { userId, commentId: { [Op.in]: plain.map((c) => c.id) } },
    attributes: ["commentId"],
  });
  const liked = new Set(likes.map((like) => like.commentId));

  return plain.map((comment) => ({ ...comment, likedByMe: liked.has(comment.id) }));
};

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
        as: "workspaces",
        where: { id: workspaceId },
        attributes: [],
        required: true,
      },
    ],
    attributes: ["id", "username", "firstName"],
  });
};

const updateMentionsInComment = async (
  commentInstance,
  authorUser,
  taskIdForContext,
  transaction,
) => {
  const mentionRegex = /@(\w+)/g;
  const content = commentInstance.content || "";
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
            as: "workspace",
            attributes: ["id"],
          },
        ],
        attributes: ["id", "workspaceId", "title"],
      });
      if (task && task.workspace) {
        const mentionedUsers = await findMentionedUsersInWorkspace(
          mentionedUsernameArray,
          task.workspace.id,
        );
        mentionedUserIds = mentionedUsers.map((user) => user.id);

        for (const mentionedUser of mentionedUsers) {
          if (mentionedUser.id !== authorUser.id) {
            await notificationService.sendNotification(
              mentionedUser.id,
              NOTIFICATION_TYPES.USER_MENTIONED,
              {
                mentionerId: authorUser.id,
                mentionerName: authorUser.firstName || authorUser.username,
                contextId: commentInstance.id,
                contextType: "comment",
                taskId: task.id,
                taskTitle: task.title,
              },
              { transaction },
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
  await commentInstance.update({ mentions: mentionedUserIds });
  return commentInstance;
};

export const getTaskComments = async (req, res) => {
  try {
    const { id } = req.params;
    const { page, limit, offset } = getPaginationParams(req.query);

    const { count, rows: comments } = await Comment.findAndCountAll({
      where: { taskId: id, parentId: null },
      include: [
        {
          model: User,
          as: "user",
          attributes: [
            "id",
            "username",
            "firstName",
            "lastName",
            "profilePicture",
          ],
        },
      ],
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    const response = createPaginatedResponse(
      await withLikedByMe(comments, req.user?.id),
      count,
      page,
      limit,
    );
    res.json(response);
  } catch (error) {
    console.error("Error fetching task comments:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch task comments" });
  }
};

export const getCommentReplies = async (req, res) => {
  try {
    const { id: taskId, commentId } = req.params;
    const { page, limit, offset } = getPaginationParams(req.query);

    const parentComment = await Comment.findByPk(commentId);
    if (!parentComment) {
      return res
        .status(404)
        .json({ success: false, error: "Parent comment not found" });
    }

    if (parentComment.taskId !== taskId) {
      return res.status(403).json({
        success: false,
        error: "Parent comment does not belong to the specified task",
      });
    }

    const { count, rows: replies } = await Comment.findAndCountAll({
      where: { parentId: commentId },
      include: [
        {
          model: User,
          as: "user",
          attributes: [
            "id",
            "username",
            "firstName",
            "lastName",
            "profilePicture",
          ],
        },
      ],
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    const response = createPaginatedResponse(
      await withLikedByMe(replies, req.user?.id),
      count,
      page,
      limit,
    );
    res.json(response);
  } catch (error) {
    console.error("Error fetching comment replies:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch comment replies" });
  }
};

export const addTaskComment = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id: taskId } = req.params;
    const { parentId } = req.body;
    const content = sanitizeRichText(req.body.content);
    const userId = req.user.id;

    if (!content || !taskId) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        error: "Comment content and taskId are required",
      });
    }

    let parentComment = null;
    if (parentId) {
      parentComment = await Comment.findOne({
        where: { id: parentId, taskId: taskId },
        transaction: t,
      });
      if (!parentComment) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          error: "Parent comment not found or does not belong to this task",
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
      { transaction: t },
    );

    if (parentComment) {
      await parentComment.increment("replyCount", { transaction: t });
    }

    comment = await updateMentionsInComment(comment, req.user, taskId, t);

    const populatedComment = await Comment.findByPk(comment.id, {
      include: [
        {
          model: User,
          as: "user",
          attributes: [
            "id",
            "username",
            "firstName",
            "lastName",
            "profilePicture",
          ],
        },
      ],
      transaction: t,
    });

    const task = await Task.findByPk(taskId, {
      include: [
        {
          model: User,
          as: "assignees",
          attributes: ["id"],
        },
        {
          model: User,
          as: "creator",
          attributes: ["id"],
        },
      ],
      transaction: t,
    });

    const usersToNotify = new Set([
      ...task.assignees.map((a) => a.id),
      task.createdById,
    ]);

    if (parentComment) {
      usersToNotify.add(parentComment.userId);
    }

    usersToNotify.delete(userId);

    if (usersToNotify.size > 0) {
      await notificationService.sendBulkNotification(
        Array.from(usersToNotify),
        NOTIFICATION_TYPES.COMMENT_CREATED,
        {
          taskId: task.id,
          taskTitle: task.title,
          commentId: populatedComment.id,
          commenterId: userId,
          commenterName: req.user.firstName || req.user.username,
        },
        { transaction: t },
      );
    }

    const event = await persistWorkspaceEvent(
      {
        workspaceId: task.workspaceId,
        type: WORKSPACE_EVENTS.COMMENT_CREATED,
        actorId: userId,
        payload: { taskId: task.id, commentId: populatedComment.id },
      },
      { transaction: t },
    );
    const webhookDeliveries = await queueDeliveriesForEvent(event, { transaction: t });

    await t.commit();
    await emitWorkspaceEvent({
      workspaceId: task.workspaceId,
      type: WORKSPACE_EVENTS.COMMENT_CREATED,
      actorId: userId,
      payload: { taskId: task.id, commentId: populatedComment.id },
    });
    await dispatchQueuedDeliveries(webhookDeliveries);
    return res.status(201).json({
      success: true,
      data: populatedComment.toJSON(),
    });
  } catch (error) {
    await t.rollback();
    console.error("Add Comment Error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to add comment",
    });
  }
};

export const updateComment = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id: taskId, commentId } = req.params;
    const content = sanitizeRichText(req.body.content);
    const userId = req.user.id;

    if (!content) {
      await t.rollback();
      return res
        .status(400)
        .json({ success: false, error: "Content is required" });
    }

    const comment = await Comment.findByPk(commentId, { transaction: t });

    if (!comment) {
      await t.rollback();
      return res
        .status(404)
        .json({ success: false, error: "Comment not found" });
    }

    if (comment.taskId !== taskId) {
      await t.rollback();
      return res.status(403).json({
        success: false,
        error: "Comment does not belong to the specified task",
      });
    }

    if (comment.userId !== userId) {
      await t.rollback();
      return res.status(403).json({
        success: false,
        error: "You are not authorized to update this comment",
      });
    }

    comment.content = content;
    await comment.save({ transaction: t });

    const updatedCommentWithMentions = await updateMentionsInComment(
      comment,
      req.user,
      comment.taskId,
      t,
    );

    const populatedComment = await Comment.findByPk(
      updatedCommentWithMentions.id,
      {
        include: [
          {
            model: User,
            as: "user",
            attributes: [
              "id",
              "username",
              "firstName",
              "lastName",
              "profilePicture",
            ],
          },
        ],
        transaction: t,
      },
    );

    await t.commit();
    res.json({ success: true, comment: populatedComment });
  } catch (error) {
    await t.rollback();
    console.error("Error updating comment:", error);
    res.status(500).json({ success: false, error: "Failed to update comment" });
  }
};

export const deleteComment = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id: taskId, commentId } = req.params;
    const userId = req.user.id;

    const comment = await Comment.findByPk(commentId, {
      include: [{ model: Comment, as: "parent" }],
      transaction: t,
    });

    if (!comment) {
      await t.rollback();
      return res
        .status(404)
        .json({ success: false, error: "Comment not found" });
    }

    if (comment.taskId !== taskId) {
      await t.rollback();
      return res.status(403).json({
        success: false,
        error: "Comment does not belong to the specified task",
      });
    }

    if (comment.userId !== userId) {
      const task = await Task.findByPk(taskId, {
        attributes: ["workspaceId"],
        transaction: t,
      });
      const membership = await sequelize.models.WorkspaceTeam.findOne({
        where: { workspaceId: task.workspaceId, userId },
        transaction: t,
      });
      const isAdmin =
        membership && ["admin", "creator"].includes(membership.role);

      if (!isAdmin) {
        await t.rollback();
        return res.status(403).json({
          success: false,
          error: "You are not authorized to delete this comment",
        });
      }
    }

    await comment.destroy({ transaction: t });

    if (comment.parentId && comment.parent) {
      await comment.parent.decrement("replyCount", { transaction: t });
    }

    await t.commit();
    res
      .status(200)
      .json({ success: true, message: "Comment deleted successfully" });
  } catch (error) {
    await t.rollback();
    console.error("Error deleting comment:", error);
    res.status(500).json({ success: false, error: "Failed to delete comment" });
  }
};

export const likeComment = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id: taskId, commentId } = req.params;
    const userId = req.user.id;

    const comment = await Comment.findByPk(commentId, { transaction: t });

    if (!comment) {
      await t.rollback();
      return res
        .status(404)
        .json({ success: false, error: "Comment not found" });
    }

    if (comment.taskId !== taskId) {
      await t.rollback();
      return res.status(403).json({
        success: false,
        error: "Comment does not belong to the specified task",
      });
    }

    const existingLike = await CommentLike.findOne({
      where: {
        commentId,
        userId,
      },
      transaction: t,
    });

    if (existingLike) {
      await t.rollback();
      return res
        .status(400)
        .json({ success: false, error: "You have already liked this comment" });
    }

    await Promise.all([
      CommentLike.create(
        {
          commentId,
          userId,
        },
        { transaction: t },
      ),
      comment.increment("likeCount", { transaction: t }),
    ]);

    await t.commit();
    res
      .status(201)
      .json({ success: true, message: "Comment liked successfully" });
  } catch (error) {
    await t.rollback();
    console.error("Error liking comment:", error);
    res.status(500).json({ success: false, error: "Failed to like comment" });
  }
};

export const unlikeComment = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id: taskId, commentId } = req.params;
    const userId = req.user.id;

    const comment = await Comment.findByPk(commentId, { transaction: t });

    if (!comment) {
      await t.rollback();
      return res
        .status(404)
        .json({ success: false, error: "Comment not found" });
    }

    if (comment.taskId !== taskId) {
      await t.rollback();
      return res.status(403).json({
        success: false,
        error: "Comment does not belong to the specified task",
      });
    }

    const existingLike = await CommentLike.findOne({
      where: {
        commentId,
        userId,
      },
      transaction: t,
    });

    if (!existingLike) {
      await t.rollback();
      return res
        .status(400)
        .json({ success: false, error: "You have not liked this comment" });
    }

    await Promise.all([
      existingLike.destroy({ transaction: t }),
      comment.decrement("likeCount", { transaction: t }),
    ]);

    await t.commit();
    res
      .status(200)
      .json({ success: true, message: "Comment unliked successfully" });
  } catch (error) {
    await t.rollback();
    console.error("Error unliking comment:", error);
    res.status(500).json({ success: false, error: "Failed to unlike comment" });
  }
};

/**
 * Marks a task's discussion as read up to now for the requesting user.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @return {Object} JSON response with the recorded timestamp.
 */
export const markTaskRead = async (req, res) => {
  try {
    const { id: taskId } = req.params;
    const task = await Task.findByPk(taskId, { attributes: ["id"] });
    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }

    const lastReadAt = new Date();
    const [row] = await TaskRead.findOrCreate({
      where: { userId: req.user.id, taskId },
      defaults: { userId: req.user.id, taskId, lastReadAt },
    });
    await row.update({ lastReadAt });

    return res.json({ success: true, data: { taskId, lastReadAt } });
  } catch (error) {
    console.error("Mark Task Read Error:", error);
    return res
      .status(500)
      .json({ success: false, error: "Failed to mark the task as read" });
  }
};
