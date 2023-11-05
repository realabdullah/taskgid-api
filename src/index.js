import express from 'express';
import bodyParser from 'body-parser';
import user from './routes/userRoutes.js';
import workspace from './routes/workspaceRoutes.js';
import cors from 'cors';
import 'dotenv/config';
// eslint-disable-next-line no-unused-vars
import mongoose from './db.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(cors());

app.use('/users', user);
app.use('/workspaces', workspace);

app.listen(port, () => console.log(`Server is running on port ${port}`));
