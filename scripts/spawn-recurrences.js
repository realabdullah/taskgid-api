#!/usr/bin/env node

/**
 * Creates a task for every recurrence occurrence that has come due.
 *
 * Run from cron rather than from a timer inside the API process, so a restart
 * or a second instance cannot double-create. Running it more often than the
 * shortest rule costs nothing: occurrences are claimed strictly after the last
 * one already spawned.
 *
 *   0 * * * * cd /path/to/taskgid-api && node scripts/spawn-recurrences.js
 */
import 'dotenv/config';
import sequelize from '../src/config/database.js';
import setupAssociations from '../src/models/associations.js';
import {spawnDueOccurrences} from '../src/services/recurrenceService.js';

setupAssociations();

try {
    const result = await spawnDueOccurrences(new Date());
    console.log(
        `Recurrences: ${result.rules} active, created ${result.created}, failed ${result.failed}`,
    );
    await sequelize.close();
    process.exit(result.failed > 0 ? 1 : 0);
} catch (error) {
    console.error('Recurrence run failed:', error);
    await sequelize.close();
    process.exit(1);
}
