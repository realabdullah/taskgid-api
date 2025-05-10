#!/usr/bin/env node

import {spawn} from 'child_process';
import path from 'path';
import {fileURLToPath} from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Run npx sequelize-cli command to execute migrations
const sequelize = spawn('npx', ['sequelize-cli', 'db:migrate'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
    env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV || 'development',
    },
});

sequelize.on('close', (code) => {
    console.log(`Migrations completed with exit code ${code}`);
    process.exit(code);
});

sequelize.on('error', (err) => {
    console.error('Failed to run migrations:', err);
    process.exit(1);
});
