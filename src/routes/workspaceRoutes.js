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
    getWorkspaceActivities,
    getComprehensiveTeamMembers,
    getUserTasks,
    getUserWorkspaceActivities,
} from '../controllers/workspaceController.js';
import {
    getWorkspaceStatistics,
} from '../controllers/statisticsController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import {validateWorkspaceInput} from '../middleware/validationMiddleware.js';

const router = new express.Router();

router.use(authMiddleware);

// --- Workspace Listing & Creation ---
router.get('/', getWorkspaces);
router.post('/', validateWorkspaceInput, addNewWorkspace);

// --- Specific Workspace Operations (by Slug) ---
router.get('/:slug', getWorkspace);
router.put('/:slug', validateWorkspaceInput, updateWorkspace);
router.delete('/:slug', deleteWorkspace);
router.get('/:slug/activities', getWorkspaceActivities);

// --- Team Management (by Workspace Slug) ---
router.get('/:slug/team', getWorkspaceTeam);
router.get('/:slug/team/comprehensive', getComprehensiveTeamMembers);
router.post('/:slug/team', addTeamMember);
router.delete('/:slug/team/:userIdToRemove', removeTeamMember);

// --- Member-specific data ---
router.get('/:slug/members/:memberId/tasks', getUserTasks);
router.get('/:slug/members/:memberId/activities', getUserWorkspaceActivities);

// --- Admin Role Management (by Workspace Slug & User ID) ---
router.post('/:slug/admins/:userId', promoteToAdmin);
router.delete('/:slug/admins/:userId', demoteFromAdmin);

// statistics
router.get('/:slug/statistics', getWorkspaceStatistics);

export default router;
