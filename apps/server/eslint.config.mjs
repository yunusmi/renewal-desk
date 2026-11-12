import tseslint from 'typescript-eslint';

export default tseslint.config(...tseslint.configs.recommended, { files: ['db/**/*.js'], rules: { '@typescript-eslint/no-require-imports': 'off' } }, {
  ignores: ['dist/**'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
});
