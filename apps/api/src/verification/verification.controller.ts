import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, type RawBodyRequest, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, Public, StaffOnly } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { VerificationService } from './verification.service';

const Kyb = z.object({ status: z.enum(['kyb_verified', 'kyb_rejected', 'kyb_pending', 'registered']) });

@Controller('verification')
export class VerificationController {
  constructor(private readonly svc: VerificationService) {}

  @Get('config')
  config() {
    return { kycEnabled: this.svc.enabled(), provider: 'didit', mode: 'sandbox' };
  }

  @Post('kyc/session')
  @HttpCode(200)
  start(@CurrentUser() u: AuthUser) {
    return this.svc.start(u);
  }

  @Post('kyc/refresh')
  @HttpCode(200)
  refresh(@CurrentUser() u: AuthUser) {
    return this.svc.refresh(u);
  }

  @Public()
  @Post('webhook')
  @HttpCode(200)
  webhook(@Req() req: RawBodyRequest<Request>, @Headers('x-signature') sig?: string, @Headers('x-timestamp') ts?: string) {
    return this.svc.webhook(req.rawBody, sig, ts);
  }

  @StaffOnly('verifier')
  @Post('kyb/:orgId')
  @HttpCode(200)
  kyb(@CurrentUser() u: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string, @Body(new ZodPipe(Kyb)) b: z.infer<typeof Kyb>) {
    return this.svc.setKyb(orgId, b.status, u.id);
  }
}
