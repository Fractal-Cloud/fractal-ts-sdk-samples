/**
 * fatal.ts — the ONE place a sample is allowed to report a failure.
 *
 * Credentials travel to the API as HTTP headers (`X-ClientID` /
 * `X-ClientSecret`), and Node's inspection of a failed superagent request walks
 * `err.response.res.req._header` — the raw request header block. So the obvious
 * `main().catch(err => console.error(err))` prints the service-account secret
 * in full, and the likeliest failure on a customer's FIRST run is exactly the
 * one that triggers it: a 401/403 from a mistyped credential. Measured against
 * a local 403 with the real installed SDK: 85 KB of output carrying both the
 * secret and the client id. These samples are the documented CI entrypoint, and
 * CI logs are long-lived, widely readable and frequently exported.
 *
 * Three layers, because one is not enough:
 *   1. Print only fields that cannot carry request headers — status, message and
 *      the server's response body. Never the error object, never `stack`,
 *      never `response.res` / `response.req`.
 *   2. Scrub any known secret VALUE out of the text on the way out, which also
 *      covers leak paths nobody has enumerated yet.
 *   3. Cover the routes that never reach `fatal` at all: `unhandledRejection`,
 *      `uncaughtException`, and `console.log` on the success path. Installed on
 *      import — see the bottom of this file.
 */

/**
 * Environment variables whose values must never appear in output. Scrubbing by
 * value rather than by name is what makes layer 2 useful: a scrubber keyed on
 * names cannot redact a secret that surfaced inside an unrelated string.
 */
const SECRET_ENV_VARS = [
  'SERVICE_ACCOUNT_SECRET',
  'AZURE_SP_CLIENT_SECRET',
  'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
  'SSH_PRIVATE_KEY',
  'SSH_PASSPHRASE',
  'DB_PASSWORD',
];

/**
 * Redaction floors, per SINK rather than one global value.
 *
 * These two sinks want opposite things and a single number cannot serve both. On
 * STDOUT the risk of over-redaction is real: every sample prints
 * `LIVE_SYSTEM_ID=<ownerType>/<ownerId>/<boundedContext.name>/<ls>`, and a short
 * secret that happens to equal `wizard` (the DEFAULT `BC_NAME`) or `1111` would
 * rewrite the identifier customers copy for teardown — silent corruption. On
 * STDERR there is no such line, so over-redacting a diagnostic costs nothing
 * while under-redacting costs a credential. `SSH_PASSPHRASE` and `DB_PASSWORD`
 * are user-chosen and routinely short, so the diagnostic path must not exempt
 * them.
 *
 * One- and two-character values are still skipped: replacing every occurrence of
 * a single character would destroy the message outright, and such a value cannot
 * be a meaningful credential.
 */
const DIAGNOSTIC_MIN_REDACTABLE = 3;
const STDOUT_MIN_REDACTABLE = 8;

/** Longest response body printed before clipping. */
const MAX_BODY_CHARS = 2000;

/** A secret value together with one concrete spelling it can take in output. */
interface SecretForm {
  name: string;
  form: string;
}

/**
 * Every spelling of every known secret that could appear in output, longest
 * first.
 *
 * Two spellings, because a literal byte comparison is not enough. `JSON.stringify`
 * renders a real newline as the two characters `\n`, a quote as `\"`, and a
 * control character as `\uXXXX`. A secret containing any of those — and
 * `SSH_PRIVATE_KEY` contains newlines by definition — never matches its raw form
 * inside a serialized body, so the secret most damaging to leak was the one least
 * protected. The escaped spelling is derived with the SAME transform that
 * produces the output rather than hand-written, so the two cannot drift.
 *
 * Longest first matters: if one secret's value is a prefix of another's,
 * substituting the short one first destroys the long one's match and leaves its
 * tail in the output.
 */
function secretForms(minLength: number): SecretForm[] {
  const forms: SecretForm[] = [];
  for (const name of SECRET_ENV_VARS) {
    const value = process.env[name];
    if (value === undefined || value.length < minLength) {
      continue;
    }
    forms.push({name, form: value});
    const escaped = JSON.stringify(value).slice(1, -1);
    if (escaped !== value) {
      forms.push({name, form: escaped});
    }
  }
  return forms.sort((a, b) => b.form.length - a.form.length);
}

function applyForms(text: string, forms: SecretForm[]): string {
  let out = text;
  for (const {name, form} of forms) {
    if (out.includes(form)) {
      out = out.split(form).join(`***${name} REDACTED***`);
    }
  }
  return out;
}

/** Replace every spelling of every known secret in a rendered string. */
function redactText(text: string, minLength: number): string {
  return applyForms(text, secretForms(minLength));
}

/** Is this something whose own enumerable properties are the whole story? */
function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Redact the DATA before it is serialized, walking strings, arrays, and the keys
 * as well as the values of plain objects. At this point the strings are raw, so
 * no escaping has happened yet and the raw form matches.
 *
 * Anything that is not a plain object or an array is passed through untouched:
 * a `Date`, a `Buffer` or a class instance renders through its own `toJSON`, and
 * rebuilding it as a plain object turns `"1970-01-01T00:00:00.000Z"` into `{}`,
 * destroying the diagnostic for no security gain. The post-serialization sweep in
 * `describeBody` covers those.
 */
function redactData(value: unknown, forms: SecretForm[], depth = 0): unknown {
  if (typeof value === 'string') {
    return applyForms(value, forms);
  }
  if (value === null || typeof value !== 'object' || depth >= 8) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(item => redactData(item, forms, depth + 1));
  }
  if (!isPlainObject(value)) {
    return value;
  }
  // Null-prototype: assigning a `__proto__` key onto a normal `{}` would hit the
  // inherited setter instead of creating an own property, silently dropping that
  // entry from the output.
  const out: Record<string, unknown> = Object.create(null);
  for (const [key, item] of Object.entries(value)) {
    out[applyForms(key, forms)] = redactData(item, forms, depth + 1);
  }
  return out;
}

/** The subset of a thrown value this module is willing to look at. */
interface InspectableError {
  status?: unknown;
  message?: unknown;
  name?: unknown;
  response?: {body?: unknown};
  cause?: unknown;
}

/**
 * Render the server's response body — safe in itself, since it is the response
 * rather than our request, but it may echo something we sent.
 *
 * The order of the steps is the whole point:
 *   1. redact the parsed data, where values are raw and match their raw form;
 *   2. serialize, so escaping is applied to text that is already clean;
 *   3. sweep the serialized string as well, because `redactData` walks own
 *      enumerable properties and a `toJSON()` or a getter can introduce a secret
 *      during serialization that the walk never saw;
 *   4. only then clip. Clipping first printed the head of a secret that straddled
 *      the boundary — 25 of 35 characters, measured — and truncation is not
 *      redaction.
 */
function describeBody(body: unknown): string {
  const forms = secretForms(DIAGNOSTIC_MIN_REDACTABLE);
  let json: string;
  try {
    json = JSON.stringify(redactData(body, forms));
  } catch {
    return '\n  response body: [not serializable]';
  }
  if (json === undefined || json === '{}' || json === 'null') {
    return '';
  }
  json = applyForms(json, forms);
  if (json.length > MAX_BODY_CHARS) {
    const head = json.slice(0, MAX_BODY_CHARS);
    return `\n  response body: ${head}… [clipped, ${json.length} chars]`;
  }
  return `\n  response body: ${json}`;
}

/**
 * A one-line-per-layer summary of a failure. The SDK wraps some errors as
 * `new Error(hint, {cause: original})` and the original still carries the header
 * block, so the cause chain is walked field-by-field rather than printed.
 */
function describe(err: unknown, depth = 0): string {
  if (typeof err !== 'object' || err === null) {
    return String(err);
  }
  const e = err as InspectableError;
  const status = typeof e.status === 'number' ? `HTTP ${e.status}: ` : '';
  let message: string;
  if (typeof e.message === 'string' && e.message.length > 0) {
    message = e.message;
  } else if (typeof e.name === 'string') {
    message = e.name;
  } else {
    message = 'Error';
  }
  let out = `${status}${message}`;
  if (e.response?.body !== undefined && e.response.body !== null) {
    out += describeBody(e.response.body);
  }
  if (e.cause !== undefined && e.cause !== null && depth < 5) {
    out += `\n  caused by: ${describe(e.cause, depth + 1)}`;
  }
  return out;
}

/**
 * Print a redacted summary of a fatal error and exit non-zero. Pass it straight
 * to `catch`: `main().catch(fatal)`.
 */
export function fatal(err: unknown): never {
  console.error(
    `deploy failed: ${redactText(describe(err), DIAGNOSTIC_MIN_REDACTABLE)}`,
  );
  process.exit(1);
}

/**
 * Redact known secret values from the console writers, not only from what
 * `fatal` prints.
 *
 * Covered: `console.log`, `info`, `warn`, `error`, `debug`, `trace` — the string
 * arguments of each. NOT covered, and deliberately so: `console.dir`, which
 * inspects the object itself so a string-argument wrapper cannot reach it, and
 * `process.stdout.write` / `process.stderr.write`. Neither the samples nor the
 * SDK uses any of those three, so this is a documented boundary rather than a
 * live gap — but do not read the list as "everything the process writes".
 *
 * `fatal` sees a failure only if it reaches `main().catch(...)`. Two routes go
 * around it: Node's own printer for an unhandled rejection or a throw at module
 * scope (measured at 63 KB with the header block in it), and — on the SUCCESS
 * path — `console.log`. Every sample prints `LIVE_SYSTEM_ID=…`, and the SDK's
 * wait-mode lines print the same id as `system=<id>` from inside a package this
 * repo cannot edit. Wrapping the writers is the only place that covers both.
 *
 * Limits, stated so this is not mistaken for a substitute. It can only redact a
 * value currently in the environment under one of the names above: a secret that
 * never became one of those variables — because a mis-quoted `.env` line moved it
 * somewhere else — is invisible to it, which is why the parser refuses malformed
 * input rather than relying on this. And it knows two spellings, raw and
 * JSON-escaped; a value re-encoded some third way (URL-escaping, base64) would
 * not match.
 */
type Writer = (...args: unknown[]) => void;

function redactArgs(args: unknown[], minLength: number): unknown[] {
  const forms = secretForms(minLength);
  return args.map(arg =>
    typeof arg === 'string' ? applyForms(arg, forms) : arg,
  );
}

function installConsoleRedaction(): void {
  const original: Record<
    'log' | 'info' | 'warn' | 'error' | 'debug' | 'trace',
    Writer
  > = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
    trace: console.trace.bind(console),
  };
  // stdout carries the LIVE_SYSTEM_ID line, so it takes the higher floor; stderr
  // is diagnostics only, where a short user-chosen passphrase matters more than a
  // tidy message.
  const out = STDOUT_MIN_REDACTABLE;
  const err = DIAGNOSTIC_MIN_REDACTABLE;
  console.log = (...args: unknown[]) => original.log(...redactArgs(args, out));
  console.info = (...args: unknown[]) =>
    original.info(...redactArgs(args, out));
  console.debug = (...args: unknown[]) =>
    original.debug(...redactArgs(args, out));
  console.warn = (...args: unknown[]) =>
    original.warn(...redactArgs(args, err));
  console.error = (...args: unknown[]) =>
    original.error(...redactArgs(args, err));
  console.trace = (...args: unknown[]) =>
    original.trace(...redactArgs(args, err));
}

installConsoleRedaction();

// The process-level net. A rejection that never reaches `main()`'s chain, or a
// throw while this module's importer is still evaluating, would otherwise hit
// Node's default printer and dump the whole error graph — request headers
// included. Registering here means importing `fatal` is enough to be covered;
// no entrypoint has to remember to opt in.
process.on('unhandledRejection', fatal);
process.on('uncaughtException', fatal);
