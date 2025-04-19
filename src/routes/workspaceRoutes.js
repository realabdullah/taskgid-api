import express from 'express';
import {
    getWorkspaces,
    getWorkspace,
    updateWorkspace,
    deleteWorkspace,
    addNewWorkspace,
    addAdmin,
    removeAdmin,
    removeUser,
} from '../controllers/workspaceController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import {
    checkAdminMiddleware,
    checkSuperAdminMiddleware,
} from '../middleware/workspaceMiddleware.js';
import {validateWorkspaceInput} from '../middleware/validationMiddleware.js';

const router = new express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Public workspace routes
router.get('/', getWorkspaces);
router.get('/:slug', getWorkspace);

// Admin management routes (super admin only)
router.post('/:slug/admins', checkSuperAdminMiddleware, addAdmin);
router.delete('/:slug/admins', checkSuperAdminMiddleware, removeAdmin);

// User management routes (admin or super admin)
router.delete('/:slug/users', checkAdminMiddleware, removeUser);

// Workspace management routes (super admin only)
router.post('/', addNewWorkspace);
router.put(
    '/:slug',
    checkSuperAdminMiddleware,
    validateWorkspaceInput,
    updateWorkspace,
);
router.delete('/:slug', checkSuperAdminMiddleware, deleteWorkspace);

export default router;
