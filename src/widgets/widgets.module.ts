import { Module } from '@nestjs/common';
import {
  WidgetsV1Controller,
  WidgetsV2Controller,
} from './widgets.controller';

/** Demonstrates URI API versioning + deprecation (Step 17). */
@Module({
  controllers: [WidgetsV1Controller, WidgetsV2Controller],
})
export class WidgetsModule {}
