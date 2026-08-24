---
description: Never mask stack traces when user-supplied callbacks or argument functions throw
alwaysApply: true
---

# Preserve errors from callbacks and argument functions

When calling a function the caller passed in (generators, compressors, hooks, listeners, and similar
callbacks), do **not** swallow or replace the thrown value in a way that hides its stack trace.

Do **not** use `Error` `cause` for this. It is not handled consistently by loggers and tooling; prefer
the original thrown value as-is.

## Required behavior

- If a throw from the callback is the correct program outcome in that context, **do not** wrap the
  call in `try` / `catch`; let it propagate.
- If a `try` / `catch` is required for other reasons (for example to handle expected I/O failures
  around the same block), **rethrow** any error that came from the user callback unchanged
  (`throw error`).
- Do **not** discard the caught value (`void error`, empty `catch`, logging-only without rethrow).
- Do **not** replace the callback’s error with a new `RotatingFileStreamError` (or similar) that
  drops the original stack.

```ts
// ❌ BAD: masks the real stack
try {
  return callback(arg);
} catch (error) {
  void error;
  throw new RotatingFileStreamError("callback failed");
}

// ❌ BAD: do not use cause to “preserve” the original
try {
  return callback(arg);
} catch (error) {
  throw new RotatingFileStreamError("callback failed");
}

// ✅ GOOD: no try/catch when the throw is the desired outcome
return callback(arg);

// ✅ GOOD: try/catch needed for other work; rethrow callback errors
try {
  return callback(arg);
} catch (error) {
  throw error;
}
```

Applies to published package code under `packages/**`. Root `index.ts` / `test/*` are reference-only
and must not be edited for this rule.
