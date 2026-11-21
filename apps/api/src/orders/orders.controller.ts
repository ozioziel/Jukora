import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { DeliveryInputSchema } from '@jucumari/shared';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { EscrowService } from '../escrow/escrow.service';
import { OrdersService } from './orders.service';

const FromListing = z.object({
  listingId: z.uuid(),
  quantity: z.number().int().positive().max(100_000),
  projectId: z.uuid().optional(),
  requirementId: z.uuid().optional(),
  delivery: DeliveryInputSchema,
});
const SupplierUpdate = z.object({
  status: z.enum(['preparing', 'shipped', 'delivery_notified']),
  carrier: z.string().trim().max(60).optional(),
  tracking: z.string().trim().max(80).optional(),
});
const Prepare = z.object({
  action: z.enum(['fund', 'change_status', 'approve', 'dispute']),
  evidence: z.string().max(200).optional(),
});
const Submit = z.object({ signedXdr: z.string().min(50).max(20_000) });
const Review = z.object({
  supplierRating: z.number().int().min(1).max(5),
  productRating: z.number().int().min(1).max(5).optional(),
  comment: z.string().trim().max(1000).optional(),
});

@Controller()
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly escrow: EscrowService,
  ) {}

  @Get('escrow/status')
  escrowStatus() {
    return this.escrow.status();
  }

  @Post('orders/from-listing')
  fromListing(@CurrentUser() u: AuthUser, @Body(new ZodPipe(FromListing)) b: z.infer<typeof FromListing>) {
    return this.orders.fromListing(u, b);
  }

  @Get('orders')
  list(@CurrentUser() u: AuthUser, @Query('as') as?: string) {
    return this.orders.list(u, as === 'supplier' ? 'supplier' : 'buyer');
  }

  @Get('orders/:id')
  detail(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.detail(u, id);
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.cancel(u, id);
  }

  @Post('orders/:id/supplier-update')
  @HttpCode(200)
  supplierUpdate(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(SupplierUpdate)) b: z.infer<typeof SupplierUpdate>,
  ) {
    return this.orders.supplierUpdate(u, id, b);
  }

  @Post('orders/:id/review-start')
  @HttpCode(200)
  startReview(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.startReview(u, id);
  }

  @Post('orders/:id/rating')
  rating(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Review)) b: z.infer<typeof Review>) {
    return this.orders.review(u, id, b);
  }

  /** Inicia el pago protegido: despliega el escrow (no mueve fondos). */
  @Post('orders/:id/escrow')
  @HttpCode(200)
  openEscrow(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.escrow.open(u, id);
  }

  @Post('orders/:id/escrow/prepare')
  @HttpCode(200)
  prepare(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Prepare)) b: z.infer<typeof Prepare>) {
    return this.escrow.prepare(u, id, b.action, { evidence: b.evidence });
  }

  @Post('escrow/txs/:txId/submit')
  @HttpCode(200)
  submit(@CurrentUser() u: AuthUser, @Param('txId', ParseUUIDPipe) txId: string, @Body(new ZodPipe(Submit)) b: z.infer<typeof Submit>) {
    return this.escrow.submit(u, txId, b.signedXdr);
  }
}
