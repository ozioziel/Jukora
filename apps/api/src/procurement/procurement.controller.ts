import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { ProcurementService } from './procurement.service';

const decimal = z.string().regex(/^\d{1,13}(\.\d{1,7})?$/);
const country = z.string().regex(/^[A-Z]{2}$/);
const RfqSchema = z.object({
  title: z.string().trim().min(3).max(120),
  specs: z.array(z.string().max(120)).max(15).optional(),
  quantity: z.number().int().positive().max(1_000_000),
  unit: z.string().trim().max(30).optional(),
  destinationCountry: country,
  destinationCity: z.string().trim().max(80).optional(),
  deadlineDays: z.number().int().positive().max(3650).optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3,5}$/)
    .optional(),
  needs: z.array(z.enum(['delivery', 'installation', 'warranty', 'insurance', 'pickup', 'maintenance'])).optional(),
  projectId: z.uuid().optional(),
  requirementId: z.uuid().optional(),
  listingId: z.uuid().optional(),
  visibility: z.enum(['private', 'invited', 'public']),
  consentPublish: z.boolean().optional(),
  inviteOrgIds: z.array(z.uuid()).max(10).optional(),
  shareBudget: z.boolean().optional(),
  budgetMax: decimal.optional(),
});
const QuoteSchema = z.object({
  description: z.string().trim().max(1000).optional(),
  quantity: z.number().int().positive().max(1_000_000),
  unitPrice: decimal,
  shipping: decimal.optional(),
  taxes: decimal.optional(),
  currency: z.string().regex(/^[A-Z]{3,5}$/),
  leadTimeDays: z.number().int().min(0).max(3650).optional(),
  incoterm: z.string().max(10).optional(),
  warranty: z.string().max(200).optional(),
  terms: z.string().max(1000).optional(),
  validDays: z.number().int().min(1).max(60),
});

@Controller()
export class ProcurementController {
  constructor(private readonly svc: ProcurementService) {}

  @Post('rfqs')
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(RfqSchema)) b: z.infer<typeof RfqSchema>) {
    return this.svc.createRfq(u, b);
  }

  @Get('rfqs/mine')
  mine(@CurrentUser() u: AuthUser) {
    return this.svc.myRfqs(u);
  }

  @Get('rfqs/:id')
  detail(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.rfqDetail(u, id);
  }

  @Post('rfqs/:id/quotes')
  quote(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(QuoteSchema)) b: z.infer<typeof QuoteSchema>,
  ) {
    return this.svc.sendQuote(u, id, b);
  }

  @Get('supplier/rfqs')
  supplierRfqs(@CurrentUser() u: AuthUser, @Query('q') q?: string, @Query('country') country?: string) {
    return this.svc.supplierRfqs(u, { q: q?.slice(0, 80), country: /^[A-Z]{2}$/.test(country ?? '') ? country : undefined });
  }

  @Get('quotes/mine')
  myQuotes(@CurrentUser() u: AuthUser) {
    return this.svc.myQuotes(u);
  }

  @Get('supplier/quotes')
  supplierQuotes(@CurrentUser() u: AuthUser) {
    return this.svc.supplierQuotes(u);
  }

  @Post('quotes/:id/accept')
  @HttpCode(200)
  accept(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.acceptQuote(u, id);
  }

  @Post('quotes/:id/reject')
  @HttpCode(200)
  reject(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.rejectQuote(u, id);
  }

  @Post('quotes/:id/withdraw')
  @HttpCode(200)
  withdraw(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.withdrawQuote(u, id);
  }
}
