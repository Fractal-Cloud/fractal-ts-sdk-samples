/**
 * caas_live_system.ts
 *
 * CaaS live system for the basic observability stack.
 * Maps blueprint components to CaaS offers: Prometheus, Jaeger, and Elastic.
 */

import {LiveSystem, Prometheus, Jaeger, ObservabilityElastic} from 'fractal-ts-sdk';
import {fractal, monitoring, tracing, logging} from './fractal';

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

  return LiveSystem.build({
    fractal,
    components: [prometheus, jaeger, elastic],
  });
}
