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
    },
  },
);
