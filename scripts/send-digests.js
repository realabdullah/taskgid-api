#!/usr/bin/env node

/**
 * Sends any digests due right now.
 *
 * Run hourly from cron rather than from a timer inside the API process, so a
 * restart or a second instance cannot double-send:
 *
 *   0 * * * * cd /path/to/taskgid-api && node scripts/send-digests.js
 */
import 'dotenv/config';
import {sendDueDigests} from '../src/services/digestService.js';
import sequelize from '../src/config/database.js';
import setupAssociations from '../src/models/associations.js';

setupAssociations();

try {
    const result = await sendDueDigests(new Date());
    console.log(
        `Digests: considered ${result.considered}, sent ${result.sent}, skipped ${result.skipped}`,
    );
    await sequelize.close();
    process.exit(0);
} catch (error) {
    console.error('Digest run failed:', error);
    await sequelize.close();
    process.exit(1);
}
