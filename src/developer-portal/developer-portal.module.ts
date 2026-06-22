import { Global, Module } from '@nestjs/common';
import { DeveloperPortalController } from './developer-portal.controller';
import { DeveloperPortalService } from './developer-portal.service';

/**
 * @Global so main.ts can fetch DeveloperPortalService to hand it the generated
 * OpenAPI document after Swagger builds it.
 */
@Global()
@Module({
  controllers: [DeveloperPortalController],
  providers: [DeveloperPortalService],
  exports: [DeveloperPortalService],
})
export class DeveloperPortalModule {}
