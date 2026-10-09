const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');
const { fixupConfigRules } = require('@eslint/compat');
module.exports = defineConfig([
  ...fixupConfigRules(expo),
  { ignores: ['dist/**', '.expo/**', 'coverage/**'] },
  { rules: { 'no-console': 'error' } },
]);
