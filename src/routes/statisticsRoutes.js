import express from 'express';
import {
    getWorkspaceStatistics,
} from '../controllers/statisticsController.js';
import authMiddleware from '../middleware/authMiddleware.js';

// eslint-disable-next-line new-cap
const router = express.Router();

// Apply auth middleware
router.use(authMiddleware);

// Route to get statistics for a specific workspace
// Authorization (checking if user is part of workspace) happens inside the controller
router.get('/workspaces/:id/statistics', getWorkspaceStatistics);

export default router;
