import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, Public } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PaymentsService } from './payments.service';

const Ramp = z.object({ tokenAmount: z.string().regex(/^\d{1,6}(\.\d{1,7})?$/), orderId: z.uuid().optional() });
const Signed = z.object({ signedXdr: z.string().min(50).max(20_000) });

@Controller('payments')
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  @Public()
  @Get('config')
  config() {
    return this.svc.config();
  }

  @Get('wallet')
  wallet(@CurrentUser() u: AuthUser) {
    return this.svc.wallet(u);
  }

  @Post('trustline')
  @HttpCode(200)
  prepareTrustline(@CurrentUser() u: AuthUser) {
    return this.svc.prepareTrustline(u);
  }

  @Post('trustline/submit')
  @HttpCode(200)
  submitTrustline(@CurrentUser() u: AuthUser, @Body(new ZodPipe(Signed)) b: z.infer<typeof Signed>) {
    return this.svc.submitTrustline(u, b.signedXdr);
  }

  @Post('ramps')
  createRamp(@CurrentUser() u: AuthUser, @Body(new ZodPipe(Ramp)) b: z.infer<typeof Ramp>) {
    return this.svc.createSimulatedRamp(u, b);
  }

  @Get('ramps/:id')
  ramp(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.ramp(u, id);
  }

  @Post('ramps/:id/simulate-bank-payment')
  @HttpCode(200)
  simulate(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.simulateBankPayment(u, id);
  }
}
