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
    getTeamStatistics,
    exportWorkspaceDataCSV,
} from '../controllers/workspaceController.js';
import {
    getWorkspaceStatistics,
} from '../controllers/statisticsController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import {validateWorkspaceInput} from '../middleware/validationMiddleware.js';
import {
    checkMemberMiddleware,
    checkAdminMiddleware,
    checkSuperAdminMiddleware,
} from '../middleware/workspaceMiddleware.js';
import tagRoutes from './tagRoutes.js';

const router = new express.Router();

router.use(authMiddleware);

// --- Workspace Listing & Creation ---
router.get('/', getWorkspaces);
router.post('/', validateWorkspaceInput, addNewWorkspace);

// --- Specific Workspace Operations (by Slug) ---
router.get('/:slug', checkMemberMiddleware, getWorkspace);
router.put('/:slug', checkSuperAdminMiddleware, validateWorkspaceInput, updateWorkspace);
router.delete('/:slug', checkSuperAdminMiddleware, deleteWorkspace);
router.get('/:slug/activities', checkMemberMiddleware, getWorkspaceActivities);
router.get('/:slug/export/csv', checkAdminMiddleware, exportWorkspaceDataCSV);

// --- Tag Management (by Workspace Slug) ---
router.use('/:workspaceSlug/tags', checkMemberMiddleware, tagRoutes);

// --- Team Management (by Workspace Slug) ---
router.get('/:slug/team', checkMemberMiddleware, getWorkspaceTeam);
router.get('/:slug/team/comprehensive', checkAdminMiddleware, getComprehensiveTeamMembers);
router.get('/:slug/team/statistics', checkAdminMiddleware, getTeamStatistics);
router.post('/:slug/team', checkAdminMiddleware, addTeamMember);
router.delete('/:slug/team/:userIdToRemove', checkAdminMiddleware, removeTeamMember);

// --- Member-specific data ---
router.get('/:slug/members/:memberId/tasks', checkMemberMiddleware, getUserTasks);
router.get('/:slug/members/:memberId/activities', checkMemberMiddleware, getUserWorkspaceActivities);

// --- Admin Role Management (by Workspace Slug & User ID) ---
router.post('/:slug/admins/:userId', checkSuperAdminMiddleware, promoteToAdmin);
router.delete('/:slug/admins/:userId', checkSuperAdminMiddleware, demoteFromAdmin);

// statistics
router.get('/:slug/statistics', checkMemberMiddleware, getWorkspaceStatistics);

export default router;
