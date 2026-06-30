module.exports = {
  root: true,
  env: {
    es2021: true,
    node: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: "module",
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  plugins: ["@typescript-eslint"],
  ignorePatterns: ["lib/", "node_modules/", "scripts/"],
  rules: {
    quotes: ["warn", "double", { allowTemplateLiterals: true }],
  },
};
