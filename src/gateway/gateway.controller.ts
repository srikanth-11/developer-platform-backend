import {
  All,
  Body,
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeyContext } from '../api-keys/decorators/api-key-context.decorator';
import type { ApiKeyContextData } from '../api-keys/api-key-context.interface';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { GatewayService } from './gateway.service';
import { GatewayTimingInterceptor } from './interceptors/gateway-timing.interceptor';

/**
 * The gateway: where CLIENT APPLICATIONS call in with `x-api-key`.
 *
 * The pipeline applied to every route here:
 *   ApiKeyGuard (authenticate)  →  GatewayTimingInterceptor (id + timing + envelope)
 *
 * Step 9 inserts a rate-limit guard into this chain; Step 10 taps the
 * interceptor's request id/timing to persist an api_logs row.
 */
@Controller('gateway')
// Order matters: authenticate first (sets apiKeyContext), THEN rate-limit it.
@UseGuards(ApiKeyGuard, RateLimitGuard)
@UseInterceptors(GatewayTimingInterceptor)
export class GatewayController {
  constructor(private readonly gatewayService: GatewayService) {}

  /** GET /api/gateway/whoami — the authenticated app/org identity. */
  @Get('whoami')
  whoami(@ApiKeyContext() ctx: ApiKeyContextData) {
    return { message: 'API key is valid', authenticatedAs: ctx };
  }

  /** GET /api/gateway/upstreams — which backend services are routable. */
  @Get('upstreams')
  upstreams() {
    return { upstreams: this.gatewayService.listUpstreams() };
  }

  /** ANY /api/gateway/services/:service — route to a backend service root. */
  @All('services/:service')
  routeService(
    @Param('service') service: string,
    @ApiKeyContext() caller: ApiKeyContextData,
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    return this.gatewayService.route({
      service,
      resource: null,
      method: req.method,
      body,
      caller,
    });
  }

  /** ANY /api/gateway/services/:service/:resource — route to a specific resource. */
  @All('services/:service/:resource')
  routeResource(
    @Param('service') service: string,
    @Param('resource') resource: string,
    @ApiKeyContext() caller: ApiKeyContextData,
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    return this.gatewayService.route({
      service,
      resource,
      method: req.method,
      body,
      caller,
    });
  }
}
