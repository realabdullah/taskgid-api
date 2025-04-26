import express from 'express';
import {
    addTask, updateTask, deleteTask, fetchWorkspaceTask, fetchWorkspaceTasks,
} from '../controllers/taskController.js';
import {getTaskComments, addTaskComment} from '../controllers/commentController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import {checkMemberMiddleware} from '../middleware/workspaceMiddleware.js';
import {validateTaskInput, validateCommentInput} from '../middleware/validationMiddleware.js';

// eslint-disable-next-line new-cap
const router = express.Router({mergeParams: true});

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Task routes (slug is now inherited from parent route via mergeParams)
router.get('/', checkMemberMiddleware, fetchWorkspaceTasks);
router.get('/:id', checkMemberMiddleware, fetchWorkspaceTask);
router.post('/', checkMemberMiddleware, validateTaskInput, addTask);
router.put('/:id', checkMemberMiddleware, validateTaskInput, updateTask);
router.delete('/:id', checkMemberMiddleware, deleteTask);

// Comment routes (slug is inherited, :id refers to task ID)
router.get('/:id/comments', checkMemberMiddleware, getTaskComments);
router.post('/:id/comments', checkMemberMiddleware, validateCommentInput, addTaskComment);

export default router;
