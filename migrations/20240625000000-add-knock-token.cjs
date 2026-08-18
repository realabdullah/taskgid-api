'use strict';

const {addColumnIfMissing, removeColumnIfPresent} = require('../scripts/migration-helpers.cjs');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await addColumnIfMissing(queryInterface, 'users', 'knock_token', {
            type: Sequelize.STRING,
            allowNull: true,
        });
    },

    down: async (queryInterface) => {
        await removeColumnIfPresent(queryInterface, 'users', 'knock_token');
    },
};
