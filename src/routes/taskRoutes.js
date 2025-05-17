import express from 'express';
import {
    addTask,
    updateTask,
    deleteTask,
    fetchWorkspaceTask,
    fetchWorkspaceTasks,
    getTaskActivities,
} from '../controllers/taskController.js';
import {
    getTaskComments,
    addTaskComment,
    getCommentReplies,
    updateComment,
    deleteComment,
    likeComment,
    unlikeComment,
} from '../controllers/commentController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import {checkMemberMiddleware} from '../middleware/workspaceMiddleware.js';
import {
    validateTaskInput,
    validateTaskUpdateInput,
    validateCommentInput,
} from '../middleware/validationMiddleware.js';

// eslint-disable-next-line new-cap
const router = express.Router({mergeParams: true});

router.use(authMiddleware);

// Task routes
router.get('/', checkMemberMiddleware, fetchWorkspaceTasks);
router.get('/:id', checkMemberMiddleware, fetchWorkspaceTask);
router.get('/:id/activities', checkMemberMiddleware, getTaskActivities);

router.post('/', checkMemberMiddleware, validateTaskInput, addTask);
router.patch('/:id', checkMemberMiddleware, validateTaskUpdateInput, updateTask);
router.delete('/:id', checkMemberMiddleware, deleteTask);

// Comment routes
router.get('/:id/comments', checkMemberMiddleware, getTaskComments);
router.post(
    '/:id/comments',
    checkMemberMiddleware,
    validateCommentInput,
    addTaskComment,
);
router.get(
    '/:id/comments/:commentId/replies',
    checkMemberMiddleware,
    getCommentReplies,
);
router.put(
    '/:id/comments/:commentId',
    checkMemberMiddleware,
    validateCommentInput,
    updateComment,
);
router.delete('/:id/comments/:commentId', checkMemberMiddleware, deleteComment);

// Like/Unlike routes
router.post('/:id/comments/:commentId/like', checkMemberMiddleware, likeComment);
router.delete('/:id/comments/:commentId/like', checkMemberMiddleware, unlikeComment);

export default router;
