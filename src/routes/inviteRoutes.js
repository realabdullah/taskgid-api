import express from 'express';
import {inviteUser, acceptInvite} from '../controllers/inviteController.js';
import {getPendingInvitations} from '../controllers/invitationController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import {validateInviteInput} from '../middleware/validationMiddleware.js';

// eslint-disable-next-line new-cap
const router = express.Router();

// Apply authentication middleware to all routes except accept invite
router.use(authMiddleware);

// Get pending invitations for the logged-in user
router.get('/pending', getPendingInvitations);

// Invite a user to a workspace
router.post('/', validateInviteInput, inviteUser);

// Accept an invite (public route)
router.post('/accept', validateInviteInput, acceptInvite);

export default router;
