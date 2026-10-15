/**
 * fractal.ts — the ARCHITECT (CCoE) authors this ONCE.
 *
 * This is a vendor-AGNOSTIC Fractal: the blueprint references only the abstract
 * Component (APIManagement.ApiGateway). It NEVER names a vendor or an offer —
 * those are chosen later when a LiveSystem is built (see <cloud>.ts). Add a new
 * gateway vendor to the catalogue tomorrow and this Fractal supports it
 * unchanged.
 *
 * It sets NO guardrail and NO operation. The gateway settings the SDK offers
 * (`withHttpsOnly`, `withRateLimit`, `withCors`, a `routes` list) are honored by
 * none of the gateway offers this sample targets — CloudFront, API Management
 * and GCP API Gateway — and building a LiveSystem refuses a setting its offer
 * cannot enforce. A guardrail nobody enforces would only look like governance,
 * so the Fractal locks nothing it cannot keep. What each gateway serves is the
 * offer's: on GCP the routes are the `apiConfig` OpenAPI document (gcp.ts).
 *
 * Imported from the locked model surface: '@fractal_cloud/sdk/model'.
 */
import {createFractal, ApiGateway} from '@fractal_cloud/sdk/model';

const boundedContextId = {
  ownerType: 'Personal',
  ownerId: process.env['OWNER_ID'] ?? '',
  name: process.env['BC_NAME'] ?? 'wizard',
};

/**
 * Author the API gateway Fractal. Returns a reusable, immutable
 * Fractal: `.specialize()` never mutates it, so it is safe to author once and
 * instantiate many times (see <cloud>.ts).
 */
export function authorFractal() {
  return createFractal({
    id: 'basic-api-management',
    version: {major: 2, minor: 0, patch: 0},
    description: 'An API gateway, vendor-agnostic.',
    boundedContextId,
    blueprint: bp => {
      // The component id is NOT cosmetic on every cloud: the Azure agent names
      // the API Management service after it, and an APIM service name is a
      // GLOBAL DNS label ({name}.azure-api.net). A generic id such as
      // 'api-gateway' is already taken by another tenant, and Azure answers the
      // create with 409 ServiceAlreadyExists forever — which is why this sample
      // never deployed. Keep the id specific to your organization.
      //
      // The previous id here, 'acme-api-gateway', was blocked by OUR OWN APIM
      // service: APIM deletion is a SOFT delete that holds the global name for
      // 48h, and nothing in the teardown path purges it. So the sample blocked
      // itself for two days after every run. Renaming sidesteps the currently
      // held name; the recurrence is only fixed by purging on teardown.
      const gateway = bp.add(
        ApiGateway({id: 'acme-apim-gateway', displayName: 'API Gateway'}),
      );

      return {gateway};
    },
  });
}
