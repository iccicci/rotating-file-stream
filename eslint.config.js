// cSpell:ignore multilines nonwords

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import { defineConfig } from "eslint/config";
import perfectionist from "eslint-plugin-perfectionist";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";
import tsEslint from "typescript-eslint";

const rootDir = dirname(fileURLToPath(import.meta.url));
const tsconfigEslint = JSON.parse(readFileSync(join(rootDir, "tsconfig.eslint.json"), "utf8"));

/** @type {import('eslint').Rule.RuleModule} */
const catchRule = {
  create: context => ({
    CatchClause: node => {
      const isValid = node.param?.type === "Identifier" && node.param.name === "error";

      if (!isValid) {
        context.report({
          fix: fixer => (node.param ? null : fixer.insertTextAfter(context.sourceCode.getFirstToken(node), " (error)")),
          messageId: "missingParam",
          node
        });
      }
    }
  }),
  meta: {
    docs: { description: "Require catch clauses to declare a parameter named 'error'.", recommended: false },
    fixable: "code",
    messages: { missingParam: "Catch clause must declare a parameter named 'error'." },
    schema: [],
    type: "suggestion"
  }
};

/** @type {import('eslint').Rule.RuleModule} */
const quotes = {
  create: context => ({
    Literal: node => {
      const { raw, value } = node;

      if (typeof value !== "string") return;

      const current = raw[0];
      const hasDouble = value.includes('"');
      const hasSingle = value.includes("'");
      const preferred = hasDouble && hasSingle ? "`" : hasDouble ? "'" : '"';

      if (current === preferred) return;

      const preferredLabel = preferred === "`" ? "backticks" : preferred === "'" ? "single quotes" : "double quotes";
      const reason = preferred === "`" ? "both \" and '" : preferred === "'" ? '"' : "default";

      context.report({
        data: { preferred: preferredLabel, reason },
        fix: fixer => {
          let wrapped;
          if (preferred === '"') wrapped = `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
          else if (preferred === "'") wrapped = `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
          else wrapped = `\`${value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${")}\``;

          return fixer.replaceText(node, wrapped);
        },
        messageId: "wrongQuote",
        node
      });
    }
  }),
  meta: { fixable: "code", messages: { wrongQuote: "Prefer {{preferred}} delimiter ({{reason}})." }, schema: [], type: "suggestion" }
};

/** @type {import('eslint').Rule.RuleModule} */
const smartQuote = {
  create: context => {
    const smartQuotes = /[‘’“”]/;

    /** @type {(node: import("eslint").Rule.Node, text: string) => void} */
    const check = (node, text) => {
      if (!smartQuotes.test(text)) return;

      context.report({
        fix: fixer =>
          fixer.replaceText(
            node,
            context.sourceCode.getText(node).replace(/[‘’“”]/g, c => {
              if (c === "‘" || c === "’") return "'";
              if (c === "“" || c === "”") return '"';
              return c;
            })
          ),
        messageId: "smartQuotes",
        node
      });
    };

    return {
      Literal: node => typeof node.value === "string" && check(node, node.value),
      TemplateElement: node => check(node, node.value.raw)
    };
  },
  meta: {
    docs: {
      description: "Disallow smart quotes (‘ ’ “ ”) and replace them with ASCII quotes.",
      recommended: false
    },
    fixable: "code",
    messages: {
      smartQuotes: "Use ASCII quotes (' or \") instead of smart quotes (‘ ’ “ ”)."
    },
    schema: [],
    type: "problem"
  }
};

const local = { rules: { catch: catchRule, quotes, smartQuote } };

const overrides = { catch: { after: false }, for: { after: false }, if: { after: false }, switch: { after: false }, while: { after: false } };
const unusedVarsOptions = { argsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true };

// Single source of truth for linted paths: tsconfig.eslint.json `include`
const typeCheckedFiles = tsconfigEslint.include.filter(pattern => pattern !== "eslint.config.js");
const packageTestFiles = typeCheckedFiles.filter(pattern => pattern.includes("/test/"));

export default defineConfig([
  {
    ignores: ["coverage/**", "node_modules/**", "**/dist/**"]
  },
  {
    files: ["eslint.config.js"],
    languageOptions: { ecmaVersion: 2020, globals: globals.node }
  },
  {
    extends: [js.configs.recommended, ...tsEslint.configs.strictTypeChecked, ...tsEslint.configs.stylisticTypeChecked],
    files: typeCheckedFiles,
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
      parserOptions: {
        project: ["./tsconfig.eslint.json"],
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      "@stylistic": stylistic,
      local,
      perfectionist,
      "simple-import-sort": simpleImportSort
    },
    rules: {
      "@stylistic/keyword-spacing": ["error", { before: true, overrides }],
      "@stylistic/space-before-function-paren": ["error", { anonymous: "never", asyncArrow: "always", catch: "never", named: "never" }],
      "@typescript-eslint/consistent-indexed-object-style": ["error", "index-signature"],
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-dynamic-delete": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-empty-interface": "off",
      "@typescript-eslint/no-extraneous-class": "off",
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-declaration-merging": "off",
      "@typescript-eslint/no-unused-vars": ["error", unusedVarsOptions],
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/use-unknown-in-catch-callback-variable": "off",
      "arrow-body-style": ["error", "as-needed"],
      "arrow-parens": ["error", "as-needed"],
      "arrow-spacing": "error",
      "brace-style": ["error", "1tbs", { allowSingleLine: true }],
      curly: ["error", "multi-or-nest"],
      eqeqeq: ["error"],
      "func-style": ["error", "expression", { allowArrowFunctions: true }],
      indent: ["error", 2],
      "key-spacing": ["error", { align: { afterColon: true, beforeColon: false, on: "value" } }],
      "linebreak-style": ["error", "unix"],
      "local/catch": "error",
      "local/smartQuote": "error",
      "max-len": ["error", { code: 150, ignoreStrings: true }],
      "no-console": "warn",
      "no-duplicate-imports": ["error", { allowSeparateTypeImports: true }],
      "no-mixed-spaces-and-tabs": ["error", "smart-tabs"],
      "perfectionist/sort-objects": ["error", { order: "asc", type: "alphabetical" }],
      "prefer-const": ["error", { destructuring: "all" }],
      "prefer-template": "error",
      quotes: ["error", "double"],
      semi: ["error", "always"],
      "simple-import-sort/exports": "error",
      "simple-import-sort/imports": "error",
      "space-unary-ops": ["error", { nonwords: false, overrides: { "!": true }, words: true }]
    }
  },
  {
    files: packageTestFiles,
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/unbound-method": "off"
    }
  }
]);
