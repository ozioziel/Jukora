import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DISPUTE_REASONS } from '@jucumari/shared';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, StaffOnly } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { DisputesService } from './disputes.service';

const decimal = z.string().regex(/^\d{1,13}(\.\d{1,7})?$/);
const Open = z.object({
  reason: z.enum(DISPUTE_REASONS),
  narrative: z.string().trim().min(10).max(4000),
  claimedAmount: decimal.optional(),
});
const Decision = z.object({ buyer: decimal, supplier: decimal, rationale: z.string().trim().min(20).max(4000) });

@Controller()
export class DisputesController {
  constructor(private readonly svc: DisputesService) {}

  @Post('orders/:id/disputes')
  open(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Open)) b: z.infer<typeof Open>) {
    return this.svc.open(u, id, b);
  }

  @Get('disputes/:id')
  detail(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.detail(u, id);
  }

  @Post('disputes/:id/evidence')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  evidence(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Body() body: { note?: string; synthetic?: string },
  ) {
    return this.svc.addEvidence(u, id, file, String(body?.note ?? ''), body?.synthetic === 'true');
  }

  @Get('evidence/:id/url')
  evidenceUrl(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.evidenceUrl(u, id);
  }

  @StaffOnly('arbiter')
  @Get('arbiter/cases')
  cases(@CurrentUser() u: AuthUser) {
    return this.svc.cases(u);
  }

  @StaffOnly('arbiter')
  @Post('arbiter/cases/:id/claim')
  @HttpCode(200)
  claim(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.claim(u, id);
  }

  @StaffOnly('arbiter')
  @Post('arbiter/cases/:id/decision')
  @HttpCode(200)
  decide(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(Decision)) b: z.infer<typeof Decision>) {
    return this.svc.decide(u, id, b);
  }
}
