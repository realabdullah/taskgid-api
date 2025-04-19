import express from 'express';
import {
    addTask, updateTask, deleteTask, fetchWorkspaceTask, fetchWorkspaceTasks,
} from '../controllers/taskController.js';
import {getTaskComments, addTaskComment} from '../controllers/commentController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import {checkMemberMiddleware} from '../middleware/workspaceMiddleware.js';
import {validateTaskInput, validateCommentInput} from '../middleware/validationMiddleware.js';

// eslint-disable-next-line new-cap
const router = express.Router();

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Task routes
router.get('/:slug', checkMemberMiddleware, fetchWorkspaceTasks);
router.get('/:slug/:id', checkMemberMiddleware, fetchWorkspaceTask);
router.post('/:slug', checkMemberMiddleware, validateTaskInput, addTask);
router.put('/:slug/:id', checkMemberMiddleware, validateTaskInput, updateTask);
router.delete('/:slug/:id', checkMemberMiddleware, deleteTask);

// Comment routes
router.get('/:slug/:id/comments', checkMemberMiddleware, getTaskComments);
router.post('/:slug/:id/comments', checkMemberMiddleware, validateCommentInput, addTaskComment);

export default router;
