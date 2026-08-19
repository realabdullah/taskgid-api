'use strict';

const {
    addColumnIfMissing,
    addIndexIfMissing,
    removeColumnIfPresent,
} = require('../scripts/migration-helpers.cjs');

/**
 * Subtasks: a task may point at a parent task.
 *
 * The column is nullable and every existing row keeps NULL, so a task with no
 * parent is top-level and the hierarchy starts out flat. Deleting a parent
 * nulls the children's parent_id rather than deleting them: a subtask carries
 * its own assignee, due date and tags, so removing it silently alongside its
 * parent would destroy work no one asked to discard. Promoted children
 * reappear in the top-level list, which is visible rather than silent.
 */
module.exports = {
    async up(queryInterface, Sequelize) {
        await addColumnIfMissing(queryInterface, 'tasks', 'parent_id', {
            type: Sequelize.UUID,
            allowNull: true,
            references: {model: 'tasks', key: 'id'},
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
        });

        // Both directions are hot: listing a parent's children, and the
        // `parent_id IS NULL` predicate every top-level count now carries.
        await addIndexIfMissing(queryInterface, 'tasks', ['parent_id'], {
            name: 'tasks_parent_id_idx',
        });
    },

    async down(queryInterface) {
        await queryInterface.removeIndex('tasks', 'tasks_parent_id_idx').catch(() => {});
        await removeColumnIfPresent(queryInterface, 'tasks', 'parent_id');
    },
};
