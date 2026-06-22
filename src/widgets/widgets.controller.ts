import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Deprecated } from '../common/decorators/deprecated.decorator';

/**
 * A demonstration of API VERSIONING. The same resource ("widgets") is served at
 * two versions with DIFFERENT response shapes — exactly the situation versioning
 * exists for: evolve the contract without breaking existing clients.
 *
 * URI versioning (enabled in main.ts) puts the version in the path:
 *   GET /api/v1/widgets   (this controller, DEPRECATED)
 *   GET /api/v2/widgets   (the new shape)
 *
 * The v1→v2 change here: the field `name` was renamed to `title`, and `createdAt`
 * was added — a typical breaking schema change that a new version absorbs.
 */
@Controller({ path: 'widgets', version: '1' })
@UseGuards(JwtAuthGuard)
@Deprecated({
  sunset: 'Wed, 31 Dec 2026 23:59:59 GMT',
  link: 'https://docs.example.com/api/migrate/v1-to-v2',
  message: 'Widgets v1 is deprecated; migrate to v2 before 2026-12-31.',
})
export class WidgetsV1Controller {
  @Get()
  list() {
    return {
      version: 'v1',
      widgets: [
        { id: 1, name: 'Sprocket' },
        { id: 2, name: 'Cog' },
      ],
    };
  }
}

@Controller({ path: 'widgets', version: '2' })
@UseGuards(JwtAuthGuard)
export class WidgetsV2Controller {
  @Get()
  list() {
    return {
      version: 'v2',
      widgets: [
        { id: '1', title: 'Sprocket', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: '2', title: 'Cog', createdAt: '2026-01-02T00:00:00.000Z' },
      ],
    };
  }
}
