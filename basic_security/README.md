# basic_security

Demonstrates governed security infrastructure using the Fractal Cloud TypeScript SDK. The blueprint locks organization-wide security posture (strict mTLS, password policy, mandatory MFA); the dev team specializes through a typed Interface and selects one concrete offer per component at LiveSystem build time.

## What it provisions

```
ServiceMesh        (mesh) — Ocelot (vendor-neutral self-hosted CaaS)
IdentityProvider   (idp)  — Cognito (AWS-managed)
```

- `ServiceMesh`: mTLS mode locked to `strict` by the architect (guardrail). Provisioned via the Ocelot self-hosted offer — no cloud provider required.
- `IdentityProvider`: minimum password length (12) and MFA enforcement locked by the architect. The dev names the user directory (`acme`) through the typed `withUserDirectory` operation. Provisioned via the Cognito offer.

## Project layout

```
src/
  fractal.ts   # Architect-authored blueprint: ServiceMesh + IdentityProvider,
               # guardrails locked, typed Interface exposed to the dev team
  aws.ts       # Dev entry point: a self-contained, runnable file you copy and run.
               # Specialize via Interface, then select one offer per component
               # (Ocelot for mesh, Cognito for idp) in the inline `select` map and deploy
```

### Blueprint / offer-selection split

| Concern | Declared in |
|---------|-------------|
| Component IDs, version, description | `fractal.ts` |
| Guardrails (mTLS mode, password policy, MFA) | `fractal.ts` — locked, not overridable |
| Application-level operation (`withUserDirectory`) | `fractal.ts` Interface |
| Offer selection per component | `aws.ts` (`select` map) |
| Credentials, environment, deploy call | `aws.ts` |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SERVICE_ACCOUNT_ID` | yes | Fractal Cloud service account ID |
| `SERVICE_ACCOUNT_SECRET` | yes | Fractal Cloud service account secret |
| `OWNER_ID` | yes | UUID of the Fractal Cloud owner |
| `ENVIRONMENT_NAME` | no | Kebab-case environment name (default: `dev`) |
| `BC_NAME` | no | Bounded-context name (default: `wizard`) |

## Running

```bash
npm install
npm run compile
```

Export the required environment variables, then run:

```bash
export SERVICE_ACCOUNT_ID=<id>
export SERVICE_ACCOUNT_SECRET=<secret>
export OWNER_ID=<uuid>

node build/src/aws.js      # deploy on AWS
```

The SDK deploys in `wait` mode: it polls until the LiveSystem reaches `Active` and emits structured log lines to stdout.
