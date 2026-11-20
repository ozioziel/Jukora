import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PROJECT_INTENTS, PROJECT_SECTORS, RESOURCE_PRIORITIES } from '@jucumari/shared';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { ProjectsService } from './projects.service';

const decimal = z.string().regex(/^\d{1,13}(\.\d{1,7})?$/);
const ProjectSchema = z.object({
  name: z.string().trim().min(2).max(60),
  sector: z.enum(PROJECT_SECTORS),
  intent: z.enum(PROJECT_INTENTS),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  city: z.string().trim().max(80).optional(),
  objective: z.string().trim().max(600).optional(),
  budgetMax: decimal.optional(),
  budgetCurrency: z
    .string()
    .regex(/^[A-Z]{3,5}$/)
    .optional(),
});
const ProjectPatchSchema = ProjectSchema.partial().extend({ archived: z.boolean().optional() });
const ResourceSchema = z.object({
  label: z.string().trim().min(2).max(80),
  category: z.string().trim().max(60).optional(),
  quantity: z.number().int().positive().max(100_000).nullable().optional(),
  unit: z.string().trim().max(30).optional(),
  priority: z.enum(RESOURCE_PRIORITIES).optional(),
  requiredSpecs: z.array(z.string().max(120)).max(12).optional(),
});

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('archived') archived?: string) {
    return this.projects.list(user.id, archived === 'true');
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(ProjectSchema)) body: z.infer<typeof ProjectSchema>) {
    return this.projects.create(user.id, body);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.projects.detail(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ProjectPatchSchema)) body: z.infer<typeof ProjectPatchSchema>,
  ) {
    return this.projects.update(user.id, id, body);
  }

  @Post(':id/resources')
  addResource(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(ResourceSchema)) body: z.infer<typeof ResourceSchema>,
  ) {
    return this.projects.addResource(user.id, id, body);
  }

  @Patch(':id/resources/:rid')
  updateResource(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('rid', ParseUUIDPipe) rid: string,
    @Body(new ZodPipe(ResourceSchema.partial())) body: Partial<z.infer<typeof ResourceSchema>>,
  ) {
    return this.projects.updateResource(user.id, id, rid, body);
  }

  @Delete(':id/resources/:rid')
  removeResource(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('rid', ParseUUIDPipe) rid: string) {
    return this.projects.removeResource(user.id, id, rid);
  }
}
