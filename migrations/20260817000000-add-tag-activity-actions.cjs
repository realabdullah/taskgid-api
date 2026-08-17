'use strict';

/**
 * The tag controller records `tags_added` and `tags_removed` activities, but
 * neither value existed in the enum, so every tag change failed to log.
 */
const ADDED_VALUES = ['tags_added', 'tags_removed'];

module.exports = {
    async up(queryInterface) {
        for (const value of ADDED_VALUES) {
            await queryInterface.sequelize.query(
                `ALTER TYPE enum_task_activities_action ADD VALUE IF NOT EXISTS '${value}';`,
            );
        }
    },

    async down() {
        // Postgres cannot drop a value from an enum without rebuilding the type,
        // and leaving an unused label is harmless.
    },
};
