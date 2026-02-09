/**
 * i18next Parser Configuration
 * Extracts translation keys from source code
 */

module.exports = {
  // Input/Output
  input: ['src/**/*.{ts,tsx}'],
  output: 'src/i18n/locales/$LOCALE/$NAMESPACE.json',
  
  // Language settings
  locales: ['en'],
  defaultNamespace: 'common',
  
  // Key separators (we use : as separator)
  contextSeparator: '_',
  keySeparator: false,
  namespaceSeparator: ':',
  
  // Lexers for parsing
  lexers: {
    tsx: [
      {
        lexer: 'JsxLexer',
        functions: ['t', 'useTranslation'],
        namespaceFunctions: ['useTranslation', 'getFixedT'],
        transAttributeName: 'i18nKey',
        htmlAttributeNames: ['accessibilityLabel', 'placeholder', 'title'],
      },
    ],
    ts: [
      {
        lexer: 'JavascriptLexer',
        functions: ['t', 'useTranslation'],
        namespaceFunctions: ['useTranslation', 'getFixedT'],
      },
    ],
  },
  
  // Options
  sort: true,
  indentation: 2,
  lineEnding: 'auto',
  
  // Keep keys that are not found in code (manual entries)
  keepRemoved: false,
  
  // Fail on update (for CI)
  failOnUpdate: false,
  
  // Verbose output
  verbose: false,
};
