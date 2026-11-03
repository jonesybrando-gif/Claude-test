import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Components render in tests with React's automatic JSX runtime, as in the app.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: { include: ["src/**/*.test.ts"], fileParallelism: false },
});
