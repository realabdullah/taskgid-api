import express from 'express';
import {inviteUser, inviteUsersBulk, acceptInvite, declineInvite, getPendingInvitations} from '../controllers/inviteController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import {validateInviteInput} from '../middleware/validationMiddleware.js';

// eslint-disable-next-line new-cap
const router = express.Router();

router.post('/accept', acceptInvite);
router.post('/decline', declineInvite);

router.use(authMiddleware);

router.get('/pending', getPendingInvitations);
router.post('/', validateInviteInput, inviteUser);
router.post('/bulk', inviteUsersBulk);

export default router;
