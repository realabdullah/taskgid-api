import express from 'express';
import {
    getWorkspaces,
    getWorkspace,
    addNewWorkspace,
    updateWorkspace,
    deleteWorkspace,
    getWorkspaceTeam,
    addTeamMember,
    removeTeamMember,
    promoteToAdmin,
    demoteFromAdmin,
} from '../controllers/workspaceController.js';
import {
    getWorkspaceStatistics,
} from '../controllers/statisticsController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import {validateWorkspaceInput} from '../middleware/validationMiddleware.js';

const router = new express.Router();

// Apply auth middleware to all workspace routes
router.use(authMiddleware);

// --- Workspace Listing & Creation ---
router.get('/', getWorkspaces);
router.post('/', validateWorkspaceInput, addNewWorkspace);

// --- Specific Workspace Operations (by ID) ---
router.get('/:id', getWorkspace);
router.put('/:id', validateWorkspaceInput, updateWorkspace);
router.delete('/:id', deleteWorkspace);

// --- Team Management (by Workspace ID) ---
router.get('/:id/team', getWorkspaceTeam);
router.post('/:id/team', addTeamMember);
router.delete('/:id/team/:userIdToRemove', removeTeamMember);

// --- Admin Role Management (by Workspace ID & User ID) ---
router.post('/:id/admins/:userId', promoteToAdmin);
router.delete('/:id/admins/:userId', demoteFromAdmin);

// statistics
router.get('/:id/statistics', getWorkspaceStatistics);

export default router;
