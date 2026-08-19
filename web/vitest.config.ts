import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests for the pure logic the portal depends on — the parsing of the
// text fields the API stores numbers in, and the formatting of the errors it
// returns. Both were places where a wrong answer reached a user silently.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { environment: "node", include: ["src/**/*.test.ts", "src/**/*.test.tsx"] },
});
