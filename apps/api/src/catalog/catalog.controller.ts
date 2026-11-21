import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser, Public } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { CatalogService } from './catalog.service';

const country = z.string().regex(/^[A-Z]{2}$/);
const QuerySchema = z.object({
  q: z.string().max(120).optional(),
  category: z.string().max(60).optional(),
  country: country.optional(),
  condition: z.enum(['new', 'used']).optional(),
  verifiedOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'lead_time']).optional(),
  page: z.coerce.number().int().min(1).max(200).optional(),
});
const OrgSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1000).optional(),
  country,
  city: z.string().trim().max(80).optional(),
  payoutAddress: z
    .string()
    .regex(/^G[A-Z2-7]{55}$/)
    .optional(),
});
const ListingSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(4000).optional(),
  category: z.string().trim().min(2).max(60),
  specs: z.record(z.string().max(40), z.string().max(120)).optional(),
  unit: z.string().trim().max(30).optional(),
  price: z
    .string()
    .regex(/^\d{1,13}(\.\d{1,7})?$/)
    .nullable()
    .optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3,5}$/)
    .optional(),
  quoteOnly: z.boolean().optional(),
  stock: z.number().int().min(0).nullable().optional(),
  minQty: z.number().int().positive().optional(),
  condition: z.enum(['new', 'used']).optional(),
  originCountry: country,
  originCity: z.string().trim().max(80).optional(),
  shipsTo: z.array(country).max(60).optional(),
  leadTimeDays: z.number().int().min(0).max(3650).nullable().optional(),
  warranty: z.string().trim().max(200).optional(),
  paymentTerms: z.string().trim().max(300).optional(),
  shippingCost: z
    .string()
    .regex(/^\d{1,13}(\.\d{1,7})?$/)
    .optional(),
  pickupAddress: z.string().trim().max(200).optional(),
});

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get('listings')
  search(@Query(new ZodPipe(QuerySchema)) query: z.infer<typeof QuerySchema>) {
    return this.catalog.search(query);
  }

  @Public()
  @Get('listings/:id')
  listing(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.detail(id);
  }

  @Public()
  @Get('suppliers/:id')
  supplier(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.supplier(id);
  }

  @Get('supplier/org')
  myOrg(@CurrentUser() user: AuthUser) {
    return this.catalog.myOrg(user);
  }

  @Post('supplier/org')
  createOrg(@CurrentUser() user: AuthUser, @Body(new ZodPipe(OrgSchema)) body: z.infer<typeof OrgSchema>) {
    return this.catalog.createOrg(user, body);
  }

  @Post('supplier/demo-join/:orgId')
  joinDemo(@CurrentUser() user: AuthUser, @Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.catalog.joinDemoOrg(user, orgId);
  }

  @Get('supplier/listings')
  myListings(@CurrentUser() user: AuthUser) {
    return this.catalog.myListings(user);
  }

  @Post('supplier/listings')
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(ListingSchema)) body: z.infer<typeof ListingSchema>) {
    return this.catalog.saveListing(user, body);
  }

  @Patch('supplier/listings/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ListingSchema)) body: z.infer<typeof ListingSchema>,
  ) {
    return this.catalog.saveListing(user, body, id);
  }

  @Post('supplier/listings/:id/:status')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('status', new ZodPipe(z.enum(['published', 'archived', 'draft']))) status: 'published' | 'archived' | 'draft',
  ) {
    return this.catalog.setListingStatus(user, id, status);
  }
}
