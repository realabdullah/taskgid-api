import express from 'express';
import {
    createRecurrence,
    deleteRecurrence,
    getWorkspaceRecurrences,
    updateRecurrence,
} from '../controllers/recurrenceController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import {checkMemberMiddleware} from '../middleware/workspaceMiddleware.js';

// eslint-disable-next-line new-cap
const router = express.Router({mergeParams: true});

router.use(authMiddleware);

router.get('/', checkMemberMiddleware, getWorkspaceRecurrences);
router.post('/', checkMemberMiddleware, createRecurrence);
router.patch('/:recurrenceId', checkMemberMiddleware, updateRecurrence);
router.delete('/:recurrenceId', checkMemberMiddleware, deleteRecurrence);

export default router;
