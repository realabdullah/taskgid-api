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

// Security constants
const MAX_DEVICES_PER_USER = 5;
const CHALLENGE_TIMEOUT = 60000; // 1 minute
const TOKEN_EXPIRY = {
    access: 60 * 60 * 1000, // 1 hour
    refresh: 30 * 24 * 60 * 60 * 1000, // 30 days
};

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

// Helper function for consistent error responses
const errorResponse = (res, status, message) => {
    return res.status(status).json({
        error: message,
        success: false,
    });
};

// Helper function for successful responses
const successResponse = (res, data) => {
    return res.json({
        success: true,
        ...data,
    });
};

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
        const user = await User.findByPk(req.user.id);
        if (!user) {
            return errorResponse(res, 404, 'User not found');
        }

        await Authn.create({
            credentialID: isoBase64URL.fromBuffer(verification.registrationInfo.credentialID),
            credentialPublicKey: isoBase64URL.fromBuffer(verification.registrationInfo.credentialPublicKey),
            counter: verification.registrationInfo.counter,
            transports: credential.transport || ['internal'],
            device: req.sanitize(device),
            userId: user.id,
        });

        // Generate tokens
        const access = await user.generateAccessToken();
        const refresh = await user.generateRefreshToken();

        return successResponse(res, {
            user,
            accessToken: {
                token: access,
                expires: new Date(Date.now() + TOKEN_EXPIRY.access),
            },
            refreshToken: {
                token: refresh,
                expires: new Date(Date.now() + TOKEN_EXPIRY.refresh),
            },
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

        // Verify the credential
        const verification = await verifyAuthenticationResponse({
            credential,
            expectedChallenge,
            expectedOrigin,
            expectedRPID,
            authenticator: {
                credentialPublicKey: isoBase64URL.toBuffer(
                    (await Authn.findOne({
                        where: {
                            credentialID: credential.id,
                        },
                    })).credentialPublicKey,
                ),
                credentialID: isoBase64URL.toBuffer(credential.id),
                counter: (await Authn.findOne({
                    where: {
                        credentialID: credential.id,
                    },
                })).counter,
            },
        });

        if (!verification.verified) {
            return errorResponse(res, 400, 'Verification failed');
        }

        // Update counter
        const authn = await Authn.findOne({
            where: {
                credentialID: credential.id,
            },
        });
        authn.counter = verification.authenticationInfo.newCounter;
        await authn.save();

        // Get user
        const user = await User.findOne({where: {email: credential.response.userHandle}});
        if (!user) {
            return errorResponse(res, 404, 'User not found');
        }

        // Generate tokens
        const access = await user.generateAccessToken();
        const refresh = await user.generateRefreshToken();

        return successResponse(res, {
            user,
            accessToken: {
                token: access,
                expires: new Date(Date.now() + TOKEN_EXPIRY.access),
            },
            refreshToken: {
                token: refresh,
                expires: new Date(Date.now() + TOKEN_EXPIRY.refresh),
            },
        });
    } catch (error) {
        console.error('Authentication error:', error);
        return errorResponse(res, 500, 'Authentication failed');
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
