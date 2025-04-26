/**
 * Database synchronization script
 * This script can be used to sync the database with the models
 * Usage: node scripts/sync-db.js [--force]
 */
import {syncDatabase} from '../src/config/database.js';
import 'dotenv/config';

const force = process.argv.includes('--force');

console.log(`Syncing database${force ? ' (force mode)' : ''}...`);

syncDatabase(force)
    .then(() => {
        console.log('Database sync completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Database sync failed:', error);
        process.exit(1);
    });
