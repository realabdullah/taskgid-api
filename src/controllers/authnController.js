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
import {UAParser} from 'ua-parser-js';
import 'dotenv/config';
import Auth from '../utils/auth.js';

const MAX_DEVICES_PER_USER = 5;
const CHALLENGE_TIMEOUT = 60000; // 1 minute

export const authLimiter = rateLimit({
    windowMs: process.env.NODE_ENV === 'production' ? 15 * 60 * 1000 : 1 * 60 * 1000,
    max: 5,
    message: {error: 'Too many authentication attempts, please try again later', success: false},
    standardHeaders: true,
    legacyHeaders: false,
});

const rpName = process.env.RPNAME;
const rpId = process.env.RPDOMAIN;
const rpOrigin = process.env.RPORIGIN;

if (!rpName || !rpId || !rpOrigin) {
    throw new Error('Missing required environment variables for WebAuthn configuration');
}

const errorResponse = (res, status, message) => res.status(status).json({error: message, success: false});
const successResponse = (res, data, statusCode = 200) =>
    res.status(statusCode).json({...data, success: true});

export const generateRegistrationOptionsWithAuthn = async (req, res) => {
    try {
        if (!req.user || !req.user.id) return errorResponse(res, 401, 'User not authenticated');

        const savedAuthns = await Authn.findAll({where: {userId: req.user.id}});
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
            userID: req.user.id,
            userName: req.user.username,
            timeout: CHALLENGE_TIMEOUT,
            attestationType: 'none',
            authenticatorSelection: {
                userVerification: 'preferred',
                residentKey: 'preferred',
                authenticatorAttachment: 'platform',
            },
            excludeCredentials,
        });

        req.user.challenge = options.challenge;
        req.user.challengeTimestamp = Date.now();
        await req.user.save();

        return successResponse(res, {options});
    } catch (error) {
        return errorResponse(res, 500, 'Failed to generate registration options');
    }
};

export const verifyAuthnResponse = async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) return errorResponse(res, 404, 'User not found');

        const verification = await verifyRegistrationResponse({
            response: req.body,
            expectedChallenge: req.user.challenge,
            expectedOrigin: rpOrigin,
            expectedRPID: rpId,
        });

        if (!verification.verified) return errorResponse(res, 400, 'Verification failed');

        const {registrationInfo} = verification;
        const {credentialID, credentialPublicKey, counter} = registrationInfo;

        const base64CredentialID = isoBase64URL.fromBuffer(credentialID);
        const base64PublicKey = isoBase64URL.fromBuffer(credentialPublicKey);

        const existingDevice = await Authn.findOne({where: {userId: user.id, credentialID: base64CredentialID}});
        if (existingDevice) {
            return errorResponse(res, 400, 'This device or security key is already registered.');
        }

        const userAgentString = req.headers['user-agent'];
        const parser = new UAParser(userAgentString);
        const deviceInfo = parser.getDevice();

        await Authn.create({
            device: {
                type: deviceInfo.type || ['Macintosh'].includes(deviceInfo.model) ? 'desktop' : 'mobile',
                vendor: deviceInfo.vendor || null,
                model: deviceInfo.model || null,
            },
            credentialPublicKey: base64PublicKey,
            credentialID: base64CredentialID,
            transports: registrationInfo.transports || ['internal'],
            counter,
            userId: req.user.id,
        });

        user.challenge = null;
        user.challengeTimestamp = null;
        await user.save();

        return successResponse(res, {message: 'Authenticator registered successfully'});
    } catch (error) {
        return errorResponse(res, 500, 'Verification failed');
    }
};

export const requestLoginWithAuthn = async (req, res) => {
    try {
        const {email} = req.body;

        if (!email) return errorResponse(res, 400, 'Email is required');

        const user = await User.findOne({
            where: {email},
            include: [{model: Authn, as: 'authns'}],
        });

        if (!user || !user.authns || user.authns.length === 0) {
            return errorResponse(res, 401, 'Authentication failed.');
        }

        const options = await generateAuthenticationOptions({
            rpID: rpId,
            allowCredentials: user.authns.map((cred) => ({
                id: cred.credentialID,
                transports: cred.transports,
            })),
            userVerification: 'required',
            timeout: CHALLENGE_TIMEOUT,
        });

        user.challenge = options.challenge;
        user.challengeTimestamp = Date.now();
        await user.save();

        return successResponse(res, {options});
    } catch (error) {
        return errorResponse(res, 500, 'Failed to generate authentication options');
    }
};

export const loginWithAuthn = async (req, res) => {
    try {
        const {id, ...restBody} = req.body;

        if (!id) return errorResponse(res, 401, 'Authentication failed.');

        const authn = await Authn.findOne({where: {credentialID: id}});
        if (!authn) return errorResponse(res, 401, 'Authentication failed.');

        const user = await User.findByPk(authn.userId);
        if (!user) return errorResponse(res, 401, 'Authentication failed.');

        const verification = await verifyAuthenticationResponse({
            response: {id, ...restBody},
            expectedChallenge: user.challenge,
            expectedOrigin: rpOrigin,
            expectedRPID: rpId,
            credential: {
                id: authn.credentialID,
                counter: Number(authn.counter),
                publicKey: isoBase64URL.toBuffer(authn.credentialPublicKey),
                transports: authn.transports,
            },
        });

        if (!verification.verified) {
            return errorResponse(res, 400, 'Authentication verification failed');
        }

        await Promise.all([
            authn.update({counter: verification.authenticationInfo.newCounter}),
            user.update({challenge: null, challengeTimestamp: null}),
        ]);

        const tokens = await Auth.generateTokenPair(user);
        res.cookie('refreshToken', tokens.refreshToken, Auth.getRefreshTokenCookieOptions());

        return successResponse(res, {
            user,
            accessToken: {token: tokens.accessToken, expiresIn: tokens.expiresIn},
        });
    } catch (error) {
        if (
            error.message.includes('Verification failed') ||
        error.message.includes('Authenticator not found')
        ) {
            return errorResponse(res, 401, 'Authentication failed: ' + error.message);
        }
        return errorResponse(res, 500, 'Login failed due to an internal error.');
    }
};

export const removeAuthn = async (req, res) => {
    try {
        const {credentialID} = req.body;

        if (!credentialID) return errorResponse(res, 400, 'Credential ID is required');

        const authn = await Authn.findOne({where: {credentialID, userId: req.user.id}});

        if (!authn) return errorResponse(res, 404, 'Authenticator not found');
        await authn.destroy();

        return successResponse(res, {message: 'Authenticator removed successfully'});
    } catch (error) {
        return errorResponse(res, 500, 'Failed to remove authenticator');
    }
};

export const fetchSavedAuthns = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return errorResponse(res, 401, 'User not authenticated');

        const savedAuthns = await Authn.findAll({where: {userId: req.user.id}});
        return successResponse(res, {authns: savedAuthns || []});
    } catch (error) {
        return errorResponse(res, 500, 'Failed to fetch devices');
    }
};
