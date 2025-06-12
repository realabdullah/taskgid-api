import express from 'express';
import {
    register, login, logout, refresh,
} from '../controllers/userController.js';
import {requestLoginWithAuthn, loginWithAuthn, authLimiter} from '../controllers/authnController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import {validateAuthInput} from '../middleware/validationMiddleware.js';

// eslint-disable-next-line new-cap
const router = express.Router();

// Apply rate limiting to all auth endpoints
router.use(authLimiter);

// Authentication routes
router.post('/register', validateAuthInput, register);
router.post('/login', validateAuthInput, login);
router.post('/logout', authMiddleware, logout);
router.post('/refresh', validateAuthInput, refresh);

// WebAuthn routes
router.post('/authn/request-login', requestLoginWithAuthn);
router.post('/authn/login', loginWithAuthn);

export default router;
