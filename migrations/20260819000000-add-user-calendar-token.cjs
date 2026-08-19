'use strict';

const {addColumnIfMissing, removeColumnIfPresent} = require('../scripts/migration-helpers.cjs');

module.exports = {
    async up(queryInterface, Sequelize) {
        await addColumnIfMissing(queryInterface, 'users', 'calendar_token_hash', {
            type: Sequelize.STRING,
            allowNull: true,
            unique: true,
        });
    },

    async down(queryInterface) {
        await removeColumnIfPresent(queryInterface, 'users', 'calendar_token_hash');
    },
};
