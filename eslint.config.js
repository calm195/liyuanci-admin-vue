import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'
import sourceConventions from './scripts/eslint/source-conventions.js'

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...vue.configs['flat/recommended'],
  {
    files: ['src/**/*.{ts,vue}', 'vite.config.ts'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        projectService: true,
        extraFileExtensions: ['.vue'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },
  { files: ['**/*.js'], ...tseslint.configs.disableTypeChecked },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx,jsx,vue}'],
    ignores: ['**/*.{spec,test}.{js,mjs,cjs,ts,tsx,jsx}', '**/__tests__/**'],
    plugins: { local: { rules: { 'source-conventions': sourceConventions } } },
    rules: { 'local/source-conventions': 'error' },
  },
  prettier,
)
