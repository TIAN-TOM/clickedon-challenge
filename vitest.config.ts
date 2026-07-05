import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // A safety net so a runaway loop fails the suite instead of hanging CI.
    testTimeout: 5000,
  },
});
