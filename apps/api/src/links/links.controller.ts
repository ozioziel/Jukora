import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { DeliveryAddressSchema } from '@jucumari/shared';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, Public } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { LinksService } from './links.service';

const decimal = z.string().regex(/^\d{1,13}(\.\d{1,7})?$/);
const LinkSchema = z.object({
  title: z.string().trim().min(3).max(120),
  productUrl: z
    .string()
    .trim()
    .max(500)
    .refine((u) => u === '' || /^https:\/\/[^\s]+$/.test(u), 'Solo enlaces https')
    .optional(),
  description: z.string().trim().max(1000).optional(),
  price: decimal,
  shipping: decimal.optional(),
  deliveryDays: z.number().int().min(1).max(180),
  mode: z.enum(['full', 'partial']),
  advance: decimal.optional(),
  validDays: z.number().int().min(1).max(30).optional(),
});
const AcceptSchema = z.object({
  delivery: DeliveryAddressSchema,
  disclosureVersion: z.string().max(40),
  disclosureHash: z.string().regex(/^[0-9a-f]{64}$/),
});
const token = z.string().regex(/^[A-Za-z0-9_-]{20,64}$/);

@Controller()
export class LinksController {
  constructor(private readonly links: LinksService) {}

  @Post('links')
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(LinkSchema)) b: z.infer<typeof LinkSchema>) {
    return this.links.create(u, b);
  }

  @Get('links/mine')
  mine(@CurrentUser() u: AuthUser) {
    return this.links.mine(u);
  }

  @Public()
  @Get('checkout/:token')
  view(@Param('token', new ZodPipe(token)) t: string) {
    return this.links.view(t);
  }

  @Post('checkout/:token/accept')
  @HttpCode(200)
  accept(
    @CurrentUser() u: AuthUser,
    @Param('token', new ZodPipe(token)) t: string,
    @Body(new ZodPipe(AcceptSchema)) b: z.infer<typeof AcceptSchema>,
  ) {
    return this.links.accept(u, t, b);
  }
}
