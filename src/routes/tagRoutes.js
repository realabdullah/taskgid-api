import express from 'express';
import {
    createTag,
    getWorkspaceTags,
    getTag,
    updateTag,
    deleteTag,
    getTagTasks,
} from '../controllers/tagController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import {checkMemberMiddleware, checkAdminMiddleware} from '../middleware/workspaceMiddleware.js';

// eslint-disable-next-line new-cap
const router = express.Router({mergeParams: true});

router.use(authMiddleware);

// Tag routes for workspace
router.get('/', checkMemberMiddleware, getWorkspaceTags);
router.post('/', checkMemberMiddleware, createTag);
router.get('/:tagId', checkMemberMiddleware, getTag);
router.put('/:tagId', checkAdminMiddleware, updateTag);
router.delete('/:tagId', checkAdminMiddleware, deleteTag);
router.get('/:tagId/tasks', checkMemberMiddleware, getTagTasks);

export default router;
