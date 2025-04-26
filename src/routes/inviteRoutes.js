import express from 'express';
import {inviteUser, acceptInvite} from '../controllers/inviteController.js';
import {getPendingInvitations} from '../controllers/invitationController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import {validateInviteInput} from '../middleware/validationMiddleware.js';

// eslint-disable-next-line new-cap
const router = express.Router();

router.use(authMiddleware);

router.get('/pending', getPendingInvitations);
router.post('/', validateInviteInput, inviteUser);
router.post('/accept', acceptInvite);

export default router;
