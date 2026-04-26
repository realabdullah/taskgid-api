import "dotenv/config";
import sequelize from "../src/config/database.js";

async function fixDatabase() {
  console.log('Checking for missing columns in "users" table...');
  try {
    const [results] = await sequelize.query(`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "invited_by" UUID;
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "registration_source" VARCHAR(255) DEFAULT 'self';
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "title" VARCHAR(255);
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "about" TEXT;
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "location" VARCHAR(255);
    `);
    console.log("Database columns verified/added successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Failed to update database schema:", error);
    process.exit(1);
  }
}

fixDatabase();
