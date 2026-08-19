#!/usr/bin/env node

/**
 * Retries every webhook delivery whose backoff window has elapsed.
 *
 *   node scripts/retry-webhook-deliveries.js
 */
import 'dotenv/config';
import {retryDueDeliveries} from '../src/services/webhookService.js';
import sequelize from '../src/config/database.js';
import setupAssociations from '../src/models/associations.js';

setupAssociations();

try {
    const result = await retryDueDeliveries();
    console.log(`Webhook retries: attempted ${result.attempted}`);
    await sequelize.close();
    process.exit(0);
} catch (error) {
    console.error('Webhook retry run failed:', error);
    await sequelize.close();
    process.exit(1);
}
