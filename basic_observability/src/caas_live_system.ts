/**
 * caas_live_system.ts
 *
 * CaaS live system for the basic observability stack.
 * Maps blueprint components to CaaS offers: Prometheus, Jaeger, and Elastic.
 */

import {
  Environment,
  Jaeger,
  KebabCaseString,
  LiveSystem,
  ObservabilityElastic,
  OwnerId,
  OwnerType,
  Prometheus,
} from '@fractal_cloud/sdk';
import {bcId, fractal, logging, monitoring, tracing} from './fractal';

export function getLiveSystem(): LiveSystem {
  const prometheus = Prometheus.satisfy(monitoring.component)
    .withNamespace('monitoring')
    .withApiGatewayUrl('http://gateway:8080')
    .build();

  const jaeger = Jaeger.satisfy(tracing.component)
    .withNamespace('tracing')
    .withStorage('elasticsearch')
    .build();

  const elastic = ObservabilityElastic.satisfy(logging.component)
    .withNamespace('logging')
    .withElasticVersion('8.12.0')
    .withElasticInstances(3)
    .withStorage('50Gi')
    .withIsKibanaRequired(true)
    .build();

  return LiveSystem.getBuilder()
    .withId(
      LiveSystem.Id.getBuilder()
        .withBoundedContextId(bcId)
        .withName(
          KebabCaseString.getBuilder()
            .withValue('basic-observability-caas')
            .build(),
        )
        .build(),
    )
    .withFractalId(fractal.id)
    .withDescription(
      'Observability on CaaS — Prometheus + Jaeger + Elastic',
    )
    .withGenericProvider('CaaS')
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
    .withComponent(prometheus)
    .withComponent(jaeger)
    .withComponent(elastic)
    .build();
}
