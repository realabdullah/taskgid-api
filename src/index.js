/* eslint-disable require-jsdoc */
import express from 'express';
import bodyParser from 'body-parser';
import auth from './routes/authRoutes.js';
import user from './routes/userRoutes.js';
import workspace from './routes/workspaceRoutes.js';
import task from './routes/taskRoutes.js';
import team from './routes/teamRoutes.js';
import invite from './routes/inviteRoutes.js';
import cors from 'cors';
import 'dotenv/config';
// eslint-disable-next-line no-unused-vars
import mongoose from './db.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(cors());

app.use('/auth', auth);
app.use('/users', user);
app.use('/workspaces', workspace);
app.use('/tasks', task);
app.use('/teams', team);
app.use('/invite', invite);

app.listen(port, () => console.log(`Server is running on port ${port}`));
