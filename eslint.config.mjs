// Lints the Apps Script source. There is no build step and no runtime
// dependency — this config exists purely to keep style mechanical rather than
// a review topic. See CONTRIBUTING.md#code-style.

/** Globals the Apps Script runtime injects. Add here when you use a new service. */
const appsScriptGlobals = {
  CalendarApp: 'readonly',
  DocumentApp: 'readonly',
  DriveApp: 'readonly',
  GmailApp: 'readonly',
  Logger: 'readonly',
  MimeType: 'readonly',
  PropertiesService: 'readonly',
  ScriptApp: 'readonly',
  Session: 'readonly',
  SpreadsheetApp: 'readonly',
  UrlFetchApp: 'readonly',
  Utilities: 'readonly',
  console: 'readonly'
};

export default [
  {
    files: ['apps-script/**/*.gs'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: appsScriptGlobals
    },
    linterOptions: {
      reportUnusedDisableDirectives: true
    },
    rules: {
      'no-undef': 'error',
      // `args: none`      — trigger handlers receive an event object they may
      //                     not use.
      // `varsIgnorePattern` — the project convention is that a trailing
      //                     underscore means private, and anything without one
      //                     is an entry point called by a trigger, the menu, or
      //                     the Run dropdown. Those are never "used" in source.
      //                     Dead private helpers are still caught.
      'no-unused-vars': [
        'error',
        { args: 'none', caughtErrors: 'none', varsIgnorePattern: '[^_]$' }
      ],
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-redeclare': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      eqeqeq: ['error', 'smart'],
      semi: ['error', 'always'],
      quotes: ['error', 'single', { avoidEscape: true }],
      indent: ['error', 2, { SwitchCase: 1, flatTernaryExpressions: true }],
      'comma-dangle': ['error', 'never'],
      'no-trailing-spaces': 'error',
      'eol-last': ['error', 'always']
    }
  },
  {
    files: ['eslint.config.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' }
  }
];
