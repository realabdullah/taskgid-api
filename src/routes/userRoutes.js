import express from 'express';
import {updateUserProfile, getUser} from '../controllers/userController.js';
import {
    generateRegistrationOptionsWithAuthn, verifyAuthnResponse, removeAuthn, fetchSavedAuthns, authLimiter,
} from '../controllers/authnController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import {validateUpdateUserProfile} from '../middleware/validationMiddleware.js';
import {updateFCMToken} from '../controllers/userController.js';

// eslint-disable-next-line new-cap
const router = express.Router();

// Apply authentication middleware to all routes
router.use(authMiddleware);

// User profile routes
router.get('/profile', getUser);
router.patch('/profile', validateUpdateUserProfile, updateUserProfile);
router.put('/fcm-token', updateFCMToken);

// WebAuthn routes with rate limiting
router.get('/authn/options', authLimiter, generateRegistrationOptionsWithAuthn);
router.post('/authn/verify', authLimiter, verifyAuthnResponse);
router.delete('/authn/:id', authLimiter, removeAuthn);
router.get('/authn', authLimiter, fetchSavedAuthns);

export default router;
