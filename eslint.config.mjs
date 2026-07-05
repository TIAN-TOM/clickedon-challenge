import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The challenge ships with intentional bugs; keep lint focused on real
      // problems, not stylistic noise that would obscure the task.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
