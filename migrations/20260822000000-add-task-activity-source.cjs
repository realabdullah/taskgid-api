'use strict';

const {addColumnIfMissing, removeColumnIfPresent} = require('../scripts/migration-helpers.cjs');

module.exports = {
    async up(queryInterface, Sequelize) {
        await addColumnIfMissing(queryInterface, 'task_activities', 'source', {
            // eslint-disable-next-line new-cap
            type: Sequelize.ENUM('user', 'agent'),
            allowNull: false,
            defaultValue: 'user',
        });
    },

    async down(queryInterface) {
        await removeColumnIfPresent(queryInterface, 'task_activities', 'source');
        await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_task_activities_source";');
    },
};
