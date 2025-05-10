'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.sequelize.query(
            'CREATE TABLE notifications_backup AS SELECT * FROM notifications;',
        );

        await queryInterface.sequelize.query(
            `ALTER TYPE enum_notifications_type ADD VALUE IF NOT EXISTS 'workspace_invite';
       ALTER TYPE enum_notifications_type ADD VALUE IF NOT EXISTS 'workspace_role_changed';
       ALTER TYPE enum_notifications_type ADD VALUE IF NOT EXISTS 'task_completed';
       ALTER TYPE enum_notifications_type ADD VALUE IF NOT EXISTS 'task_deleted';`,
        );

        console.log('Successfully updated notification type enum values');
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.sequelize.query(
            'DROP TABLE IF EXISTS notifications_backup;',
        );
    },
};
