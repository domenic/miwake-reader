import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import betterTailwindcss from 'eslint-plugin-better-tailwindcss';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import eslintPluginSvelte from 'eslint-plugin-svelte';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    ignores: ['**/build/*', '**/.svelte-kit/*', '**/*.d.ts', '**/service-worker.ts']
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly'
      }
    }
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser
      },
      parserOptions: {
        parser: '@typescript-eslint/parser',
        ecmaVersion: 2020,
        extraFileExtensions: ['.svelte'],
        projectService: {
          allowDefaultProject: [
            '*.js',
            '*.cjs',
            '*.mjs',
            '.prettierrc.cjs',
            'tailwindcss/*.cjs',
            'scripts/*.mjs',
            'playwright.config.ts'
          ]
        },
        sourceType: 'module',
        tsconfigRootDir: import.meta.dirname
      }
    },
    name: 'root',
    plugins: {
      'better-tailwindcss': betterTailwindcss
    },
    settings: {
      'better-tailwindcss': {
        entryPoint: './src/app.css'
      }
    },
    rules: {
      'no-return-assign': ['error', 'except-parens'],
      'no-underscore-dangle': 'off',
      '@typescript-eslint/no-use-before-define': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'prettier/prettier': [
        'error',
        {
          endOfLine: 'auto'
        }
      ],
      'better-tailwindcss/enforce-canonical-classes': 'error'
    }
  },
  {
    files: ['**/!(*.d).ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
      ]
    }
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^\\.\\.?/.*(?<!\\.[a-z]+)$',
              message: 'Relative imports under tests/ must include a file extension (e.g. .ts).'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['tests/integration/**/*.ts'],
    ignores: ['tests/integration/helpers/harness.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@playwright/test',
              importNames: ['expect', 'test'],
              message: 'Import test and expect from the integration test harness instead.'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs'
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
    }
  },
  ...eslintPluginSvelte.configs['flat/recommended'],
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: { parser: '@typescript-eslint/parser' }
    },
    rules: {
      'except-parens': 'off',
      quotes: ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }]
    }
  }
);
