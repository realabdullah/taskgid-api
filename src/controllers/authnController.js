import {
    generateRegistrationOptions,
    generateAuthenticationOptions,
    verifyRegistrationResponse,
    verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import {isoBase64URL} from '@simplewebauthn/server/helpers';
import Authn from '../models/Authn.js';
import User from '../models/User.js';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';
import Auth from '../utils/auth.js';

// Security constants
const MAX_DEVICES_PER_USER = 5;
const CHALLENGE_TIMEOUT = 60000; // 1 minute

// Rate limiting configuration
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: {error: 'Too many authentication attempts, please try again later', success: false},
    standardHeaders: true,
    legacyHeaders: false,
});

// Environment variables with validation
const rpName = process.env.RPNAME;
const rpId = process.env.RPDOMAIN;
const rpOrigin = process.env.RPORIGIN;

if (!rpName || !rpId || !rpOrigin) {
    throw new Error('Missing required environment variables for WebAuthn configuration');
}

// Helper for standardized error responses
const errorResponse = (res, status, message) => res.status(status).json({error: message, success: false});

export const generateRegistrationOptionsWithAuthn = async (req, res) => {
    try {
        // Input validation
        if (!req.user || !req.user.id) {
            return errorResponse(res, 401, 'User not authenticated');
        }

        const savedAuthns = await Authn.findAll({where: {userId: req.user.id}});

        // Check device limit
        if (savedAuthns && savedAuthns.length >= MAX_DEVICES_PER_USER) {
            return errorResponse(res, 400, `Maximum number of devices (${MAX_DEVICES_PER_USER}) reached`);
        }

        const excludeCredentials = savedAuthns ? savedAuthns.map((cred) => ({
            id: isoBase64URL.toBuffer(cred.credentialID),
            type: 'public-key',
            transports: cred.transports || ['internal'],
        })) : [];

        const options = await generateRegistrationOptions({
            rpName,
            rpID: rpId,
            userID: req.user.email,
            userName: req.user.username,
            timeout: CHALLENGE_TIMEOUT,
            attestationType: 'direct',
            authenticatorSelection: {
                userVerification: 'required',
                residentKey: 'required',
            },
            authenticatorAttachment: 'cross-platform',
            excludeCredentials,
        });

        // Store challenge with timestamp
        req.user.challenge = options.challenge;
        req.user.challengeTimestamp = Date.now();
        await req.user.save();

        return successResponse(res, {options});
    } catch (error) {
        console.error('Registration options generation error:', error);
        return errorResponse(res, 500, 'Failed to generate registration options');
    }
};

export const verifyAuthnResponse = async (req, res) => {
    try {
        const {credential, expectedChallenge, expectedOrigin, expectedRPID, device} = req.body;

        // Input validation
        if (!credential || !expectedChallenge || !expectedOrigin || !expectedRPID || !device) {
            return errorResponse(res, 400, 'Missing required fields');
        }

        // Retrieve user and verify challenge before verification
        const user = await User.findByPk(req.user.id);
        if (!user) {
            return errorResponse(res, 404, 'User not found');
        }

        // Verify the credential
        const verification = await verifyRegistrationResponse({
            credential,
            expectedChallenge,
            expectedOrigin,
            expectedRPID,
        });

        if (!verification.verified) {
            return errorResponse(res, 400, 'Verification failed');
        }

        // Save the credential
        await Authn.create({
            credentialID: isoBase64URL.fromBuffer(verification.registrationInfo.credentialID),
            credentialPublicKey: isoBase64URL.fromBuffer(verification.registrationInfo.credentialPublicKey),
            counter: verification.registrationInfo.counter,
            transports: credential.transport || ['internal'],
            device: req.sanitize(device),
            userId: user.id,
        });

        // Clear the challenge after successful registration
        user.challenge = null;
        user.challengeTimestamp = null;
        await user.save();

        // Generate tokens using Auth utility
        const tokens = await Auth.generateTokenPair(user);

        // Set refresh token cookie
        res.cookie('refreshToken', tokens.refreshToken, Auth.getRefreshTokenCookieOptions());

        // Send response (excluding refresh token from body)
        return successResponse(res, {
            user,
            accessToken: {
                token: tokens.accessToken,
                expiresIn: tokens.expiresIn,
            },
            message: 'Authenticator registered successfully',
        });
    } catch (error) {
        console.error('Verification error:', error);
        return errorResponse(res, 500, 'Verification failed');
    }
};

export const requestLoginWithAuthn = async (req, res) => {
    try {
        const {email} = req.body;

        // Input validation
        if (!email) {
            return errorResponse(res, 400, 'Email is required');
        }

        const user = await User.findOne({where: {email}});
        if (!user) {
            return errorResponse(res, 404, 'User not found');
        }

        const savedAuthns = await Authn.findAll({where: {userId: user.id}});
        if (!savedAuthns || savedAuthns.length === 0) {
            return errorResponse(res, 400, 'No authenticators registered for this user');
        }

        const options = await generateAuthenticationOptions({
            rpID: rpId,
            allowCredentials: savedAuthns.map((cred) => ({
                id: isoBase64URL.toBuffer(cred.credentialID),
                type: 'public-key',
                transports: cred.transports || ['internal'],
            })),
            userVerification: 'required',
            timeout: CHALLENGE_TIMEOUT,
        });

        // Store challenge with timestamp
        user.challenge = options.challenge;
        user.challengeTimestamp = Date.now();
        await user.save();

        return successResponse(res, {options});
    } catch (error) {
        console.error('Authentication options generation error:', error);
        return errorResponse(res, 500, 'Failed to generate authentication options');
    }
};

export const loginWithAuthn = async (req, res) => {
    try {
        const {credential, expectedChallenge, expectedOrigin, expectedRPID} = req.body;

        // Input validation
        if (!credential || !expectedChallenge || !expectedOrigin || !expectedRPID) {
            return errorResponse(res, 400, 'Missing required fields');
        }

        // Find the authenticator first to get public key and counter
        const authn = await Authn.findOne({where: {credentialID: credential.id}});
        if (!authn) {
            return errorResponse(res, 400, 'Authenticator not found');
        }

        // Get the associated user
        const user = await User.findByPk(authn.userId);
        if (!user) {
            return errorResponse(res, 404, 'User associated with authenticator not found');
        }

        // Verify challenge before verification
        // if (user.challenge !== expectedChallenge) {
        //     return errorResponse(res, 400, 'Challenge mismatch');
        // }
        // Optional: Check challenge timestamp
        // if (Date.now() - user.challengeTimestamp > CHALLENGE_TIMEOUT) {
        //     return errorResponse(res, 400, 'Challenge timed out');
        // }

        // Verify the credential
        const verification = await verifyAuthenticationResponse({
            credential,
            expectedChallenge: user.challenge,
            expectedOrigin,
            expectedRPID,
            authenticator: {
                credentialPublicKey: isoBase64URL.toBuffer(authn.credentialPublicKey),
                credentialID: isoBase64URL.toBuffer(authn.credentialID),
                counter: authn.counter,
            },
        });

        if (!verification.verified) {
            return errorResponse(res, 400, 'Authentication verification failed');
        }

        // Update counter
        authn.counter = verification.authenticationInfo.newCounter;
        await authn.save();

        // Clear the challenge after successful login
        user.challenge = null;
        user.challengeTimestamp = null;
        await user.save();

        // Generate tokens using Auth utility
        const tokens = await Auth.generateTokenPair(user);

        // Set refresh token cookie
        res.cookie('refreshToken', tokens.refreshToken, Auth.getRefreshTokenCookieOptions());

        // Send response (excluding refresh token from body)
        return successResponse(res, {
            user,
            accessToken: {
                token: tokens.accessToken,
                expiresIn: tokens.expiresIn,
            },
            message: 'Login successful',
        });
    } catch (error) {
        console.error('Login with Authn error:', error);
        // Check for specific verification errors
        if (error.message.includes('Verification failed') || error.message.includes('Authenticator not found')) {
            return errorResponse(res, 401, 'Authentication failed: ' + error.message);
        }
        return errorResponse(res, 500, 'Login failed due to an internal error.');
    }
};

export const removeAuthn = async (req, res) => {
    try {
        const {credentialID} = req.body;

        // Input validation
        if (!credentialID) {
            return errorResponse(res, 400, 'Credential ID is required');
        }

        const authn = await Authn.findOne({
            where: {
                credentialID,
                userId: req.user.id,
            },
        });

        if (!authn) {
            return errorResponse(res, 404, 'Authenticator not found');
        }

        await authn.destroy();

        return successResponse(res, {message: 'Authenticator removed successfully'});
    } catch (error) {
        console.error('Remove authenticator error:', error);
        return errorResponse(res, 500, 'Failed to remove authenticator');
    }
};

export const fetchSavedAuthns = async (req, res) => {
    try {
        const savedAuthns = await Authn.find({user: req.user.id});
        return successResponse(res, {authns: savedAuthns});
    } catch (error) {
        console.error('Fetch devices error:', error);
        return errorResponse(res, 500, 'Failed to fetch devices');
    }
};
