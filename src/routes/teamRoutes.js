import express from 'express';
import {getWorkspaceTeam} from '../controllers/teamController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import {checkMemberMiddleware} from '../middleware/workspaceMiddleware.js';

// eslint-disable-next-line new-cap
const router = express.Router();

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Get team members for a workspace
router.get('/:slug', checkMemberMiddleware, getWorkspaceTeam);

export default router;
