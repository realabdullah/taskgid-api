'use strict';

const {addColumnIfMissing, removeColumnIfPresent} = require('../scripts/migration-helpers.cjs');

/**
 * Checklists, start dates and effort estimates on tasks.
 *
 * The checklist is a JSONB column rather than a table: items are never queried
 * or reported on apart from their task, so a column avoids a join on every
 * read and a migration every time the item shape changes.
 */
module.exports = {
    async up(queryInterface, Sequelize) {
        await addColumnIfMissing(queryInterface, 'tasks', 'checklist', {
            type: Sequelize.JSONB,
            allowNull: false,
            defaultValue: [],
        });

        await addColumnIfMissing(queryInterface, 'tasks', 'start_date', {
            type: Sequelize.DATE,
            allowNull: true,
        });

        await addColumnIfMissing(queryInterface, 'tasks', 'estimate_minutes', {
            type: Sequelize.INTEGER,
            allowNull: true,
        });
    },

    async down(queryInterface) {
        await removeColumnIfPresent(queryInterface, 'tasks', 'estimate_minutes');
        await removeColumnIfPresent(queryInterface, 'tasks', 'start_date');
        await removeColumnIfPresent(queryInterface, 'tasks', 'checklist');
    },
};
