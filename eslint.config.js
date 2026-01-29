import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import typescript from 'typescript-eslint';

export default [
  {
    ignores: ['node_modules/*', 'dist/*'],
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        allowDefaultProject: ['eslint.config.js'],
        defaultProject: './tsconfig.json',
      },
      tsconfigRootDir: import.meta.dirname,
    },
  },
  eslint.configs.recommended,
  ...typescript.configs.recommended,
  prettier,
];
