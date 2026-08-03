"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // Covers documents.viewed (userId filter + updatedAt / last-access ordering).
    await queryInterface.sequelize.query(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "views_user_id_updated_at" ON "views" ("userId", "updatedAt" DESC);'
    );

    // Now redundant: fully covered by the composite index above as a
    // leftmost-prefix.
    await queryInterface.sequelize.query(
      'DROP INDEX CONCURRENTLY IF EXISTS "views_user_id";'
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "views_user_id" ON "views" ("userId");'
    );
    await queryInterface.sequelize.query(
      'DROP INDEX CONCURRENTLY IF EXISTS "views_user_id_updated_at";'
    );
  },
};
