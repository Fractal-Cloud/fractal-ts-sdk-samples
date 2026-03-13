/**
 * azure_live_system.ts
 *
 * Satisfies the basic storage Fractal with Azure-specific components:
 *   - AzureStorageAccount       satisfies FilesAndBlobs
 *   - AzurePostgreSqlDbms       satisfies RelationalDbms  (dbVersion carried from blueprint)
 *   - AzurePostgreSqlDatabase   satisfies RelationalDatabase (collation + charset carried)
 *
 * Structural properties — dependencies, dbVersion, collation, charset —
 * are all locked in the blueprint and carried over automatically by
 * satisfy(). Only Azure-specific parameters are set here.
 *
 * Environment variables:
 *   AZURE_LOCATION        – (optional) Azure region, default "westeurope"
 *   AZURE_RESOURCE_GROUP  – (optional) Azure resource group name, default "my-resource-group"
 */

import {
  AzurePostgreSqlDatabase,
  AzurePostgreSqlDbms,
  AzureStorageAccount,
  Environment,
  KebabCaseString,
  LiveSystem,
  OwnerId,
  OwnerType,
} from '@fractal_cloud/sdk';
import {bcId, fractal, dbms, appStorage} from './fractal';

// Retrieve blueprint components by ID
function bp(id: string) {
  const c = fractal.components.find(x => x.id.toString() === id);
  if (!c) throw new Error(`Blueprint component '${id}' not found`);
  return c;
}

export function getLiveSystem(): LiveSystem {
  const location = process.env['AZURE_LOCATION'] ?? 'westeurope';
  const resourceGroup =
    process.env['AZURE_RESOURCE_GROUP'] ?? 'my-resource-group';

  // ── Storage Account — satisfies FilesAndBlobs ──────────────────────────────

  const azureStorage = AzureStorageAccount.satisfy(appStorage.component)
    .withAzureRegion(location)
    .withAzureResourceGroup(resourceGroup)
    .withKind('StorageV2')
    .withSku('Standard_LRS')
    .build();

  // ── PostgreSQL DBMS — satisfies RelationalDbms ─────────────────────────────
  // dbVersion ('15') is carried from the blueprint automatically.

  const azureDbms = AzurePostgreSqlDbms.satisfy(dbms.dbms)
    .withAzureRegion(location)
    .withAzureResourceGroup(resourceGroup)
    .withSkuName('B_Standard_B1ms')
    .withStorageGb(32)
    .build();

  // ── PostgreSQL Database — satisfies RelationalDatabase ─────────────────────
  // collation ('en_US.utf8') and charset ('UTF8') are carried from the
  // blueprint automatically. The DBMS dependency is auto-wired.

  const azureDb = AzurePostgreSqlDatabase.satisfy(bp('app-db')).build();

  // ── Live System ─────────────────────────────────────────────────────────────

  return LiveSystem.getBuilder()
    .withId(
      LiveSystem.Id.getBuilder()
        .withBoundedContextId(bcId)
        .withName(
          KebabCaseString.getBuilder()
            .withValue('basic-storage-azure')
            .build(),
        )
        .build(),
    )
    .withFractalId(fractal.id)
    .withDescription(
      'Storage workload on Azure — PostgreSQL Flexible Server + Storage Account',
    )
    .withGenericProvider('Azure')
    .withEnvironment(
      Environment.getBuilder()
        .withId(
          Environment.Id.getBuilder()
            .withOwnerType(OwnerType.Personal)
            .withOwnerId(
              OwnerId.getBuilder().withValue(process.env['OWNER_ID']!).build(),
            )
            .withName(
              KebabCaseString.getBuilder()
                .withValue(process.env['ENVIRONMENT_NAME'] ?? 'dev')
                .build(),
            )
            .build(),
        )
        .build(),
    )
    .withComponent(azureStorage)
    .withComponent(azureDbms)
    .withComponent(azureDb)
    .build();
}
