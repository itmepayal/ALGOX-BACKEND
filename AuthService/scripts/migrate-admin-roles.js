/**
 * Migrate legacy role "admin" → "super_admin" and ensure status=active.
 * Optionally bootstrap a super_admin by email:
 *   SUPER_ADMIN_EMAIL=you@example.com node scripts/migrate-admin-roles.js
 *
 * From AuthService:
 *   node scripts/migrate-admin-roles.js
 */
require("dotenv").config();
const mongoose = require("mongoose");

async function main() {
  const uri = process.env.MONGO_URL;
  if (!uri) throw new Error("MONGO_URL required");
  await mongoose.connect(uri);
  const users = mongoose.connection.collection("users");

  const roleResult = await users.updateMany(
    { role: "admin" },
    { $set: { role: "super_admin" } }
  );
  console.log(
    `Promoted ${roleResult.modifiedCount} legacy admin → super_admin`
  );

  const statusResult = await users.updateMany(
    { status: { $exists: false } },
    { $set: { status: "active" } }
  );
  console.log(`Set status=active on ${statusResult.modifiedCount} users`);

  const email = process.env.SUPER_ADMIN_EMAIL;
  if (email) {
    const res = await users.updateOne(
      { email: String(email).toLowerCase() },
      {
        $set: {
          role: "super_admin",
          status: "active",
        },
      }
    );
    if (res.matchedCount === 0) {
      console.warn(`No user found for SUPER_ADMIN_EMAIL=${email}`);
    } else {
      console.log(`Ensured ${email} is super_admin`);
    }
  } else {
    console.log(
      "Tip: set SUPER_ADMIN_EMAIL=you@example.com to promote a specific account."
    );
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
