const rules = {
  "@typescript-eslint/no-empty-function":             "off",
  "@typescript-eslint/no-empty-interface":            "off",
  "@typescript-eslint/no-explicit-any":               "off",
  "@typescript-eslint/no-unsafe-declaration-merging": "off",
  "@typescript-eslint/type-annotation-spacing":       ["error", { after: true, before: false, overrides: { arrow: { before: true } } }],
  "arrow-body-style":                                 ["error", "as-needed"],
  "arrow-parens":                                     ["error", "as-needed"],
  "arrow-spacing":                                    "error",
  "brace-style":                                      ["error", "1tbs", { allowSingleLine: true }],
  curly:                                              ["error", "multi-or-nest"],
  indent:                                             ["error", 2],
  "key-spacing":                                      ["error", { align: { afterColon: true, beforeColon: false, on: "value" } }],
  "keyword-spacing":                                  ["error", { before: true, overrides: { catch: { after: false }, for: { after: false }, if: { after: false }, switch: { after: false }, while: { after: false } } }],
  "linebreak-style":                                  ["warn", "unix"],
  "no-console":                                       "warn",
  "no-tabs":                                          "error",
  "nonblock-statement-body-position":                 ["error", "beside"],
  semi:                                               ["error", "always"],
  "sort-keys":                                        "off",
  "sort-keys/sort-keys-fix":                          "error",
  "space-before-function-paren":                      ["error", { anonymous: "never", asyncArrow: "always", named: "never" }],
  "space-unary-ops":                                  ["error", { nonwords: false, overrides: { "!": true }, words: true }]
};

module.exports = {
  env:           { amd: true, browser: true, es6: true, jquery: true, node: true },
  extends:       ["plugin:@typescript-eslint/recommended"],
  parser:        "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: 9, sourceType: "module" },
  plugins:       ["sort-keys"],
  rules
};
