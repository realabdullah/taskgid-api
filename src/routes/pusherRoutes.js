import express from 'express';
import {authenticatePusher} from '../controllers/pusherController.js';
import authMiddleware from '../middleware/authMiddleware.js';

// eslint-disable-next-line new-cap
const router = express.Router();

router.post('/auth', authMiddleware, authenticatePusher);

export default router;
