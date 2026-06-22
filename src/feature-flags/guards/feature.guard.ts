import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import { FeatureFlagsService } from '../feature-flags.service';
import { FEATURE_KEY } from './require-feature.decorator';

/**
 * FeatureGuard — enforces `@RequireFeature(...)`. Runs after the org guards, so
 * membership is already verified; this just adds "...and the org has this
 * feature switched on". Lets you ship a feature dark and enable it per-tenant.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string | undefined>(
      FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const orgId = request.params?.orgId ?? request.params?.id;
    if (!orgId || !isUUID(orgId)) {
      throw new BadRequestException('Organization id is required for this route');
    }

    const enabled = await this.featureFlags.isEnabled(orgId, required);
    if (!enabled) {
      throw new ForbiddenException(
        `Feature "${required}" is not enabled for this organization`,
      );
    }
    return true;
  }
}
