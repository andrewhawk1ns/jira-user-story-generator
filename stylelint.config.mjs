// @ts-check
/** @type {import('stylelint').Config} */
const stylelintConfig = {
  extends: ['stylelint-config-standard'],
  rules: {
    // Allow Tailwind CSS v4 at-rules
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: ['theme', 'utility', 'apply', 'custom-variant', 'import'],
      },
    ],
    // Allow Tailwind CSS v4 custom properties and functions
    'function-no-unknown': null,
    'property-no-unknown': null,
    // Disable rules incompatible with CSS-in-CSS variable usage
    'color-no-invalid-hex': true,
    'declaration-block-no-duplicate-properties': true,
  },
}

export default stylelintConfig
