#!/usr/bin/env bash
#
# deploy.sh — basic_gpu_inference: GPU VM self-hosting vLLM + results bucket + Unmanaged AI
#
#   ./deploy.sh              build and deploy the default target (gcp)
#   ./deploy.sh <target>     build and deploy a specific target
#
# Targets: gcp destroy
# `./deploy.sh destroy` tears the LiveSystem down again. That cannot be undone,
# so it asks for confirmation: it prompts for the word `destroy` when run
# interactively, and refuses without a TTY unless CONFIRM_DESTROY=yes is set.
#
# Configuration is read from ./.env — copy .sample.env to .env and fill it in.
# Variables already exported in the shell win over .env, so CI can inject
# secrets without writing a file. Quote any value containing spaces, '#' or
# newlines; a quoted value may span several lines (see .sample.env).
#
set -euo pipefail
# Resolve the script's own location before changing directory: the --help block
# below reads this path, and "${BASH_SOURCE[0]}" is relative to the ORIGINAL
# cwd, so reading it after the cd fails for `bash ./sample/deploy.sh --help`.
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
script_path="$script_dir/$(basename -- "${BASH_SOURCE[0]}")"
cd "$script_dir"

TARGETS=(gcp destroy)
DEFAULT_TARGET=gcp

target="${1:-$DEFAULT_TARGET}"
if [[ "$target" == "-h" || "$target" == "--help" ]]; then
  sed -n '3,/^set -euo/p' "$script_path" | sed 's/^# \{0,1\}//; $d'
  exit 0
fi

valid=false
for t in "${TARGETS[@]}"; do
  if [[ "$t" == "$target" ]]; then
    valid=true
  fi
done
if [[ "$valid" != true ]]; then
  echo "deploy.sh: unknown target '$target' — valid targets: ${TARGETS[*]}" >&2
  exit 2
fi

# --- guard an irreversible target -------------------------------------------
# `destroy` tears the deployed LiveSystem down and cannot be undone, yet it
# occupies the same positional slot as `azure`/`gcp`: a stale shell-history
# entry, a copied CI snippet or a mis-set ${TARGET} variable is enough to
# select it. Require an explicit confirmation — typed interactively, or
# CONFIRM_DESTROY=yes when there is no TTY (CI). Keyed on the target NAME so a
# sample that grows a `destroy` entrypoint later is guarded automatically.
if [[ "$target" == destroy ]]; then
  if [[ "${CONFIRM_DESTROY:-}" == "yes" ]]; then
    echo "deploy.sh: CONFIRM_DESTROY=yes — proceeding with the teardown." >&2
  elif [[ -t 0 ]]; then
    echo "deploy.sh: '$target' DESTROYS the deployed LiveSystem. This cannot be undone." >&2
    printf "deploy.sh: type 'destroy' to confirm, anything else aborts: " >&2
    IFS= read -r reply || reply=""
    if [[ "$reply" != destroy ]]; then
      echo "deploy.sh: aborted — nothing was destroyed." >&2
      exit 3
    fi
  else
    echo "deploy.sh: refusing to run '$target' unconfirmed with no TTY to prompt on." >&2
    echo "deploy.sh: set CONFIRM_DESTROY=yes to proceed." >&2
    exit 3
  fi
fi

# --- load .env --------------------------------------------------------------
# One KEY=value per line. Blank lines, and lines whose first non-blank
# character is '#', are skipped; an optional leading 'export ' is ignored.
# Whitespace around KEY and around an unquoted value is trimmed. CRLF line
# endings are tolerated, so a .env saved by a Windows editor still loads.
#
# A value may be wrapped in a matching pair of single or double quotes. Only
# that outer pair is removed and the contents are taken literally, so spaces,
# '#' and the other kind of quote are all safe inside. A quoted value whose
# closing quote falls on a LATER line spans those lines verbatim — that is how
# a multi-line PEM key such as SSH_PRIVATE_KEY is carried:
#
#   SSH_PRIVATE_KEY="-----BEGIN OPENSSH PRIVATE KEY-----
#   b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAA...
#   -----END OPENSSH PRIVATE KEY-----"
#
# Inline comments are NOT stripped from a value — '#' is a legal secret
# character, and guessing would silently truncate one. Put comments on their
# own line.
#
# Anything that is not one of those forms is a hard error rather than a skipped
# line: a value dropped or truncated here resurfaces much later as an opaque
# 401 or a deploy key that only fails inside a pipeline. Errors name the
# offending .env line by NUMBER and never echo its content — this file holds
# secrets, and a diagnostic that quotes them is the bug it is reporting.
#
# A variable already set in the environment is never overwritten. A key assigned
# twice WITHIN .env is a hard error — see below.
#
# Tracing is disabled for this whole region first. Secrets are about to pass
# through shell variables, and under `bash -x` — or with an inherited
# SHELLOPTS=xtrace, which nobody had to opt into on this command line — every
# assignment and every `export` is echoed to stderr. That would defeat the
# "never echo its content" guarantee far more thoroughly than any message here.
# The caller's setting is restored once the last secret has been read.
env_xtrace_was_on=false
case "$-" in
  *x*) env_xtrace_was_on=true ;;
esac
{ set +x; } 2>/dev/null

# ONE definition of "is this line an assignment, and what does it assign".
#
# Both the .env reader and the multi-line-value scanner call THIS function. That
# sharing is the point. An earlier version restated the grammar as a separate
# regex in the scanner, and because the regex accepted less than the reader did
# — `KEY = v`, `KEY<TAB>=v`, `KEY==v`, `export KEY = v` all parse, none matched —
# a credential assignment could be absorbed into an unrelated value and then
# printed on the success path. A guard that restates a grammar can drift from it;
# a guard that calls it cannot.
#
# Sets env_key/env_value and returns 0 on success. Returns 1 when the line has no
# '=' at all, 2 when the text left of '=' is not a valid variable name.
env_key=''
env_value=''
env_name_re='^[A-Za-z_][A-Za-z0-9_]*$'
# A PEM armor line, and a PEM body line: base64 with '=' only ever as trailing
# padding. Any line matching the body pattern cannot be an assignment that
# carries a value, because everything after the first '=' would have to be '='.
env_pem_begin_re='^-----BEGIN [A-Z0-9 ]*-----$'
env_pem_armor_re='^-----(BEGIN|END) [A-Z0-9 ]*-----$'
env_pem_body_re='^[A-Za-z0-9+/]*=*$'

env_parse_assignment() {
  local env_raw="$1"
  local env_cand
  env_raw="${env_raw%$'\r'}"
  env_raw="${env_raw#"${env_raw%%[![:space:]]*}"}"
  if [[ "$env_raw" =~ ^export[[:space:]] ]]; then
    env_raw="${env_raw#export}"
    env_raw="${env_raw#"${env_raw%%[![:space:]]*}"}"
  fi
  if [[ "$env_raw" != *=* ]]; then
    return 1
  fi
  env_cand="${env_raw%%=*}"
  env_cand="${env_cand%"${env_cand##*[![:space:]]}"}"
  if [[ ! "$env_cand" =~ $env_name_re ]]; then
    return 2
  fi
  env_key="$env_cand"
  env_value="${env_raw#*=}"
  return 0
}

if [[ -f .env ]]; then
  # `read` cannot carry a NUL byte: it stops the value at the first one, so a
  # credential would be silently truncated to a fragment and the deploy would go
  # on to authenticate with it. The byte is already gone by the time `read`
  # returns, so it cannot be caught per line — compare the file's byte count with
  # and without NULs instead, once, before parsing.
  env_bytes=$(LC_ALL=C wc -c < .env)
  env_bytes_no_nul=$(LC_ALL=C tr -d '\000' < .env | LC_ALL=C wc -c)
  if ((env_bytes != env_bytes_no_nul)); then
    echo "deploy.sh: .env contains a NUL byte, which cannot be carried in a value; re-save it as plain text" >&2
    exit 1
  fi
  env_lineno=0
  env_seen_keys=' '
  while IFS= read -r line || [[ -n "$line" ]]; do
    env_lineno=$((env_lineno + 1))
    env_trimmed="${line%$'\r'}"
    env_trimmed="${env_trimmed#"${env_trimmed%%[![:space:]]*}"}"
    if [[ -z "$env_trimmed" || "$env_trimmed" == '#'* ]]; then
      continue
    fi
    env_rc=0
    env_parse_assignment "$line" || env_rc=$?
    if ((env_rc == 1)); then
      # The classic "forgot the value" typo. Splitting on a missing separator
      # would yield key == value == the whole line, exporting the name to itself
      # and satisfying the required-variable check below.
      echo "deploy.sh: .env line $env_lineno: expected KEY=value but found no '='" >&2
      exit 1
    fi
    if ((env_rc == 2)); then
      echo "deploy.sh: .env line $env_lineno: left of '=' is not a valid variable name" >&2
      exit 1
    fi
    key="$env_key"
    value="$env_value"
    # Assigning the same key twice is ambiguous, and picking a winner silently is
    # how a customer who appends a corrected credential at the bottom keeps
    # authenticating with the stale one at the top — the opaque 401 this parser
    # exists to prevent. Refuse rather than guess. (This concerns duplicates
    # WITHIN .env; the shell-wins-over-.env rule below is separate, and unchanged.)
    case "$env_seen_keys" in
      *" $key "*)
        echo "deploy.sh: .env line $env_lineno: $key is assigned more than once" >&2
        exit 1
        ;;
    esac
    env_seen_keys="$env_seen_keys$key "
    # Trailing whitespace after a value is never significant, and leaving it in
    # would make a perfectly good quoted value look unterminated, because closure
    # is tested on the LAST character. Whitespace inside the quotes is untouched.
    value="${value%"${value##*[![:space:]]}"}"
    quote=''
    case "$value" in
      \"*) quote='"' ;;
      \'*) quote="'" ;;
    esac
    if [[ -n "$quote" ]]; then
      value="${value#?}"
      if [[ "$value" == *"$quote" ]]; then
        # Opened and closed on this line: strip only the matching outer pair, so
        # a secret ending in the other quote character keeps it.
        value="${value%"$quote"}"
      elif [[ "$value" == *"$quote"* ]]; then
        # The quote closes mid-line with text after it — `KEY="v" # note`, the
        # shape a reader writes after being told to quote values. Reading that as
        # an unterminated value would start swallowing later lines, so name it.
        echo "deploy.sh: .env line $env_lineno: unexpected text after the closing $quote" >&2
        exit 1
      else
        # A value may span lines for exactly one reason: it is a PEM block. So the
        # opening line must BE the PEM armor. That single restriction means a
        # stray quote on any ordinary value cannot begin absorbing later lines at
        # all, which is where a credential was being swallowed.
        if [[ ! "$value" =~ $env_pem_begin_re ]]; then
          echo "deploy.sh: .env line $env_lineno: value opens with $quote and is not closed on this line; only a PEM block (-----BEGIN ...-----) may span lines" >&2
          exit 1
        fi
        env_open_lineno=$env_lineno
        env_closed=false
        env_absorbed=0
        while IFS= read -r cont || [[ -n "$cont" ]]; do
          env_lineno=$((env_lineno + 1))
          env_absorbed=$((env_absorbed + 1))
          # Absorption is bounded, so a malformed file cannot consume the rest of
          # .env however it is spelled. The largest key anyone pastes here is a
          # few dozen lines.
          if ((env_absorbed > 512)); then
            echo "deploy.sh: .env line $env_open_lineno: PEM block opened with $quote is still unterminated after 512 lines" >&2
            exit 1
          fi
          cont="${cont%$'\r'}"
          cont="${cont%"${cont##*[![:space:]]}"}"
          env_content="${cont%"$quote"}"
          # Barrier 1 — the SHARED definition. If the reader above would treat
          # this line as an assignment carrying a value, refuse: often enough
          # that value is a credential, and guessing is not acceptable.
          env_rc=0
          env_parse_assignment "$env_content" || env_rc=$?
          if ((env_rc == 0)) && [[ -n "${env_value//=/}" ]]; then
            echo "deploy.sh: .env line $env_open_lineno: PEM block opened with $quote is unterminated; line $env_lineno assigns $env_key" >&2
            exit 1
          fi
          # Barrier 2 — a closed whitelist of what a PEM block may contain:
          # armor, base64 body, or blank. This is deliberately narrower than
          # "not an assignment": a line matching it cannot carry an assigned
          # value at all, so the whole class is excluded rather than enumerated.
          if [[ -n "$env_content" ]] \
            && [[ ! "$env_content" =~ $env_pem_armor_re ]] \
            && [[ ! "$env_content" =~ $env_pem_body_re ]]; then
            echo "deploy.sh: .env line $env_lineno: not PEM content inside the block opened on line $env_open_lineno" >&2
            exit 1
          fi
          value="$value"$'\n'"$env_content"
          if [[ "$cont" == *"$quote" ]]; then
            env_closed=true
            break
          fi
        done
        if [[ "$env_closed" != true ]]; then
          echo "deploy.sh: .env line $env_open_lineno: PEM block opened with $quote is never closed" >&2
          exit 1
        fi
      fi
    else
      value="${value#"${value%%[![:space:]]*}"}"
    fi
    if [[ -z "${!key:-}" ]]; then
      export "$key=$value"
    fi
  done < .env
fi

# --- validate configuration -------------------------------------------------
REQUIRED=(SERVICE_ACCOUNT_ID SERVICE_ACCOUNT_SECRET OWNER_ID)

missing=()
for v in "${REQUIRED[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    missing+=("$v")
  fi
done
if ((${#missing[@]})); then
  echo "deploy.sh: missing required variables: ${missing[*]}" >&2
  echo "deploy.sh: copy .sample.env to .env and fill them in." >&2
  exit 1
fi

# Every secret has been read; give the caller back the tracing they asked for.
if [[ "$env_xtrace_was_on" == true ]]; then
  { set -x; } 2>/dev/null
fi

# --- build and deploy -------------------------------------------------------
echo "==> npm install"
npm install

echo "==> npm run compile"
npm run compile

echo "==> node build/src/$target.js  (DEPLOY_MODE=${DEPLOY_MODE:-wait})"
exec node "build/src/$target.js"
