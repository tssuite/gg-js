// @license
// Copyright (c) 2026 ggsuite
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import jsdoc from 'eslint-plugin-jsdoc';
import tsdoc from 'eslint-plugin-tsdoc';
import tseslint from 'typescript-eslint';

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Ignore generated and vendored content.
  {
    ignores: [
      '**/*.js',
      'coverage/',
      'dist/',
      'node_modules',
      '.git',
      'typescript/generated/',
      'example/browser/main.ts',
    ],
  },

  // TypeScript baseline rules for every .ts file.
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Documentation rules for the public TypeScript surface.
  {
    files: ['typescript/**/*.ts'],
    ignores: ['typescript/test/**/*.ts', 'typescript/generated/**/*.ts'],
    plugins: { tsdoc, jsdoc, tseslint },
    rules: {
      'tsdoc/syntax': 'error',
      ...jsdoc.configs['flat/recommended-typescript-flavor-error'].rules,
      'jsdoc/require-description': 'error',
      'jsdoc/require-param-type': 'off',
      'jsdoc/require-jsdoc': [
        'off',
        {
          require: {
            FunctionDeclaration: true,
            FunctionExpression: true,
            MethodDefinition: true,
            ClassDeclaration: true,
            ClassExpression: true,
            ArrowFunctionExpression: true,
          },
          contexts: [
            'TSInterfaceDeclaration',
            'TSTypeAliasDeclaration',
            'TSEnumDeclaration',
            'TSPropertySignature',
          ],
          publicOnly: true,
        },
      ],
      'jsdoc/require-returns-type': 'off',
      'jsdoc/require-returns': 'off',
    },
  },

  // Test files: relax documentation rules.
  {
    files: ['typescript/test/**/*.ts', '**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
