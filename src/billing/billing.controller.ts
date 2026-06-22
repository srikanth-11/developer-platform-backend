import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { OrgRolesGuard } from '../organizations/guards/org-roles.guard';
import { User } from '../users/entities/user.entity';
import { BillingService } from './billing.service';
import { ConfirmCheckoutDto } from './dto/confirm-checkout.dto';
import { SubscribeDto } from './dto/subscribe.dto';

/** /organizations/:orgId/billing */
@Controller('organizations/:orgId/billing')
@UseGuards(JwtAuthGuard, OrgRolesGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  /** Whether real payments (Stripe) are configured (VIEWER+). */
  @Get('config')
  @Roles(Role.VIEWER)
  config() {
    return { paymentsEnabled: this.billingService.paymentsEnabled };
  }

  /** Current subscription (VIEWER+). */
  @Get('subscription')
  @Roles(Role.VIEWER)
  async subscription(@Param('orgId', ParseUUIDPipe) orgId: string) {
    const sub = await this.billingService.ensureSubscription(orgId);
    return this.billingService.subscriptionView(sub);
  }

  /**
   * Start a paid plan change via Stripe Checkout (OWNER). Returns a redirect URL
   * (or downgrades immediately for FREE). Use this when payments are enabled.
   */
  @Post('checkout')
  @Roles(Role.OWNER)
  @HttpCode(HttpStatus.OK)
  checkout(
    @CurrentUser() user: User,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: SubscribeDto,
  ) {
    return this.billingService.createCheckout(orgId, user, dto.plan);
  }

  /** Confirm a completed Checkout Session on return from Stripe (OWNER). */
  @Post('checkout/confirm')
  @Roles(Role.OWNER)
  @HttpCode(HttpStatus.OK)
  async confirmCheckout(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: ConfirmCheckoutDto,
  ) {
    const sub = await this.billingService.confirmCheckout(orgId, dto.sessionId);
    return this.billingService.subscriptionView(sub);
  }

  /** Stripe Billing Portal link to manage card / cancel (OWNER). */
  @Post('portal')
  @Roles(Role.OWNER)
  @HttpCode(HttpStatus.OK)
  portal(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.billingService.createPortal(orgId);
  }

  /** Change plan (OWNER only — it's a commercial decision). */
  @Post('subscribe')
  @Roles(Role.OWNER)
  async subscribe(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: SubscribeDto,
  ) {
    const sub = await this.billingService.subscribe(orgId, dto.plan);
    return this.billingService.subscriptionView(sub);
  }

  /** Live usage + projected cost this period (VIEWER+). */
  @Get('usage')
  @Roles(Role.VIEWER)
  usage(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.billingService.getUsage(orgId);
  }

  /** Close the current period into an invoice (OWNER/ADMIN). */
  @Post('invoices/close')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  closeInvoice(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.billingService.closeInvoice(orgId);
  }

  /** Past invoices (VIEWER+). */
  @Get('invoices')
  @Roles(Role.VIEWER)
  invoices(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.billingService.listInvoices(orgId);
  }
}
