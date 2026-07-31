import { defineConfig } from "prisma/config";
import { PrismaNeon } from "@prisma/adapter-neon";

export default defineConfig({
  earlyAccess: true,
  schema: "./prisma/schema.prisma",
  migrate: {
    adapter: () => new PrismaNeon({
      connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
    }),
  },
});
