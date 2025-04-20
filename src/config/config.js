import crypto from 'crypto';

const jwt = {
    secret: process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex'),
    accessTokenExpiry: '7d', // 7 days
    refreshTokenExpiry: 30 * 24 * 60 * 60, // 30 days in seconds
    cookieOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
    },
};

export default {
    jwt,
};
