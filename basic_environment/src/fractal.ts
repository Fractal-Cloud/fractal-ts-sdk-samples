/**
 * fractal.ts — a tiny governed Fractal to prove the environment binding.
 *
 * The point of THIS sample is the Environment (see azure.ts), not the blueprint.
 * So the Fractal is intentionally minimal: a single governed uploads bucket. It
 * exists only so we have a real LiveSystem to deploy INTO the operational
 * environment. Vendor-agnostic as always — the offer is selected in azure.ts.
 */
import {createFractal, ObjectStorage} from '@fractal_cloud/sdk/model';

const boundedContextId = {
  ownerType: 'Personal',
  ownerId: process.env['OWNER_ID'] ?? '',
  name: process.env['BC_NAME'] ?? 'reusable-templates',
};

/** Author the minimal "governed bucket" Fractal (reusable + immutable). */
export function authorFractal() {
  return createFractal({
    id: 'basic-environment',
    version: {major: 1, minor: 0, patch: 0},
    description: 'A single governed uploads bucket (sample payload).',
    boundedContextId,
    blueprint: bp => {
      const uploads = bp.add(
        // The id becomes the Azure storage account name verbatim (the agent falls back to
        // component.getId() when no name parameter is set), and that name is global and must be
        // lowercase alphanumeric — no hyphens. Plain 'uploads' is what basic_storage asks for,
        // so the two samples collided in every sweep. Do not shorten this back.
        ObjectStorage({id: 'acmeenvuploads', displayName: 'Uploads Bucket'})
          .withEncryption('at-rest')
          .withPublicAccess(false),
      );
      return {uploads};
    },
  });
}
