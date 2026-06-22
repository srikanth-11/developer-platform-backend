import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DeveloperPortalService } from './developer-portal.service';

/**
 * Developer Portal endpoints — the resource index, downloadable Postman
 * collection, and SDK info. Require a logged-in user (the dashboard calls these
 * with a Bearer token) so the API surface isn't exposed anonymously. The raw
 * OpenAPI/Swagger UI at /docs + /docs-json is configured separately in main.ts.
 */
@Controller('developer-portal')
@UseGuards(JwtAuthGuard)
export class DeveloperPortalController {
  constructor(private readonly portal: DeveloperPortalService) {}

  /** Portal index — what's available. */
  @Get()
  index() {
    return {
      name: 'Developer Platform — Developer Portal',
      resources: {
        interactiveDocs: '/docs',
        openApiSpec: '/docs-json',
        postmanCollection: '/api/developer-portal/postman',
        sdks: '/api/developer-portal/sdks',
      },
    };
  }

  /** Downloadable Postman collection (import into Postman). */
  @Get('postman')
  postman() {
    return this.portal.toPostmanCollection();
  }

  /** How to generate client SDKs from the spec. */
  @Get('sdks')
  sdks() {
    return this.portal.sdkInfo();
  }
}
