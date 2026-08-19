import express from 'express';
import {serveCalendarFeed} from '../controllers/calendarController.js';

// eslint-disable-next-line new-cap
const router = express.Router();

// Unauthenticated: the token in the path is the credential. Calendar clients
// cannot send an Authorization header.
router.get('/:token.ics', serveCalendarFeed);

export default router;
