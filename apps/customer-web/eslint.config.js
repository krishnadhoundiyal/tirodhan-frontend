import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
export default tseslint.config(
  { ignores: ['dist/**', '.ssr/**', 'coverage/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': hooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'no-console': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '**/customer-mobile/**',
            '**/rider-mobile/**',
            '**/operations-web/**',
            '@tirodhan/customer-mobile',
            '@tirodhan/rider-mobile',
            '@tirodhan/operations-web',
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'localStorage',
        'sessionStorage',
        'indexedDB',
      ],
      'no-restricted-properties': [
        'error',
        ...['globalThis', 'window', 'self'].flatMap((object) =>
          ['localStorage', 'sessionStorage'].map((property) => ({
            object,
            property,
            message:
              'Browser credentials and personal-data storage is forbidden.',
          })),
        ),
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/platform/recovery.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MemberExpression[property.name="indexedDB"]',
          message:
            'IndexedDB is restricted to the audited encrypted recovery boundary.',
        },
      ],
    },
  },
);
