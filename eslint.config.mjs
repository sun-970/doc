import nextVitals from 'eslint-config-next/core-web-vitals'
import prettier from 'eslint-config-prettier'

const eslintConfig = [
  ...nextVitals,
  prettier,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'vendor/**',
      'coverage/**',
      'playwright-report/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
    ],
  },
  {
    // Next 16 pulls React Compiler lint (react-hooks v7). Keep existing
    // effect/state patterns as warnings so the runtime migration can land.
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/use-memo': 'off',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
]

export default eslintConfig
