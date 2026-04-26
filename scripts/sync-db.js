/**
 * Database synchronization script
 * This script can be used to sync the database with the models
 * Usage: node scripts/sync-db.js [--force]
 */
import 'dotenv/config';
import '../src/models/associations.js';
import {syncDatabase} from '../src/config/database.js';

const force = process.argv.includes('--force');
const alter = process.argv.includes('--alter');

console.log(`Syncing database${force ? ' (force mode)' : ''}${alter ? ' (alter mode)' : ''}...`);

syncDatabase({ force, alter })
    .then(() => {
        console.log('Database sync completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Database sync failed:', error);
        process.exit(1);
    });
