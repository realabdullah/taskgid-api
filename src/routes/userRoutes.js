import express from 'express';
import {editUser, updateProfilePicture, getUser} from '../controllers/userController.js';
import {
    generateRegistrationOptionsWithAuthn, verifyAuthnResponse, removeAuthn, fetchSavedAuthns, authLimiter,
} from '../controllers/authnController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import {validateUserInput, validateProfilePictureInput} from '../middleware/validationMiddleware.js';

// eslint-disable-next-line new-cap
const router = express.Router();

// Apply authentication middleware to all routes
router.use(authMiddleware);

// User profile routes
router.get('/profile', getUser);
router.put('/profile', validateUserInput, editUser);
router.put('/profile/picture', validateProfilePictureInput, updateProfilePicture);

// WebAuthn routes with rate limiting
router.get('/authn/options', authLimiter, generateRegistrationOptionsWithAuthn);
router.post('/authn/verify', authLimiter, verifyAuthnResponse);
router.delete('/authn/:id', authLimiter, removeAuthn);
router.get('/authn', authLimiter, fetchSavedAuthns);

export default router;
