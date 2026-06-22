import { BadGatewayException, Injectable } from '@nestjs/common';
import { ApiKeyContextData } from '../api-keys/api-key-context.interface';

interface RouteInput {
  service: string;
  resource: string | null;
  method: string;
  body: unknown;
  caller: ApiKeyContextData;
}

/**
 * GatewayService — the "routing" brain.
 *
 * A real gateway (Kong, RapidAPI) forwards the request to a downstream service
 * over the network:  Client → Gateway → User/Order/Payment Service.
 *
 * We don't run separate microservices in this learning project, so instead of a
 * real network proxy we ROUTE to a small registry of MOCK upstreams and return a
 * representative response. The shape of the pipeline (auth → route → respond) is
 * identical to a production gateway; only the transport is simulated.
 */
@Injectable()
export class GatewayService {
  // The "backend services" this gateway knows how to route to.
  private readonly upstreams = new Set(['users', 'orders', 'payments']);

  route(input: RouteInput) {
    if (!this.upstreams.has(input.service)) {
      // 502 Bad Gateway — the correct status when a gateway can't route to a
      // known upstream (vs 404, which would mean "this gateway has no such route").
      throw new BadGatewayException(
        `Unknown upstream service "${input.service}"`,
      );
    }

    // Simulated upstream response. In production this would be the JSON the
    // downstream microservice returned.
    return {
      routedTo: input.service,
      resource: input.resource,
      method: input.method,
      handledBy: `mock-${input.service}-service`,
      // Echo what we'd forward, plus who's calling (from the API key).
      forwarded: {
        organizationId: input.caller.organizationId,
        applicationId: input.caller.applicationId,
        body: input.body ?? null,
      },
    };
  }

  /** The list of upstreams a client is allowed to hit (handy for discovery). */
  listUpstreams(): string[] {
    return [...this.upstreams];
  }
}
