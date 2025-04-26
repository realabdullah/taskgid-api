import express from 'express';
import {getWorkspaceStatistics} from '../controllers/statisticsController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import {checkMemberMiddleware} from '../middleware/workspaceMiddleware.js';

// eslint-disable-next-line new-cap
const router = express.Router({mergeParams: true}); // Ensure mergeParams is true to access :slug

// Apply authentication and workspace membership middleware
router.use(authMiddleware);
router.use(checkMemberMiddleware);

// Define the statistics route
router.get('/statistics', getWorkspaceStatistics);

export default router;
