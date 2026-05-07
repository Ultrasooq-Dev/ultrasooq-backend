import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // seed-admin.ts is idempotent: upserts admin@ultrasooq.com plus
    // buyer/seller/freelancer test accounts. Runs automatically after
    // `prisma migrate reset --force` and on `prisma db seed`.
    seed: "tsx prisma/seed-admin.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
