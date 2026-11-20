import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { badRequest } from '../common/errors';
import { SearchService } from './search.service';

const TERMINAL_EVENTS = new Set(['done', 'partial', 'error', 'cancelled']);
const SLUG = /^[a-z0-9-]{2,60}$/;

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get('quota')
  quota(@CurrentUser() user: AuthUser) {
    return this.search.quotaStatus(user);
  }

  @Get('drafts/latest')
  latestDraft(@CurrentUser() user: AuthUser, @Query('projectId') projectId?: string) {
    return this.search.latestDraft(user.id, projectId || undefined);
  }

  @Post('drafts')
  createDraft(@CurrentUser() user: AuthUser, @Body() body: { payload?: unknown; projectId?: string }) {
    return this.search.saveDraft(user.id, body?.payload, undefined, body?.projectId || undefined);
  }

  @Put('drafts/:id')
  updateDraft(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: { payload?: unknown }) {
    return this.search.saveDraft(user.id, body?.payload, id);
  }

  /** Confirma una búsqueda: consume 1 de 10 si produce un plan útil. Requiere Idempotency-Key. */
  @Post('runs')
  @HttpCode(202)
  start(@CurrentUser() user: AuthUser, @Body() body: unknown, @Headers('idempotency-key') key?: string) {
    return this.search.start(user, body, key);
  }

  @Get('runs/:id')
  run(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.search.view(user.id, id);
  }

  @Post('runs/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.search.cancel(user.id, id);
  }

  @Post('runs/:id/resources/:slug/open')
  @HttpCode(200)
  open(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('slug') slug: string) {
    if (!SLUG.test(slug)) throw badRequest('slug_invalid');
    return this.search.openCategory(user.id, id, slug);
  }

  @Get('runs/:id/resources/:slug/candidates')
  candidates(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('slug') slug: string) {
    if (!SLUG.test(slug)) throw badRequest('slug_invalid');
    return this.search.candidates(user.id, id, slug);
  }

  /**
   * Eventos en vivo (SSE). Se reanuda con Last-Event-ID sin relanzar la búsqueda. Si el cliente no
   * soporta SSE, puede consultar GET runs/:id periódicamente.
   */
  @Get('runs/:id/events')
  async events(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request, @Res() res: Response) {
    let last = Number(req.header('last-event-id') ?? req.query.after ?? 0) || 0;
    await this.search.events(user.id, id, last); // valida propiedad antes de abrir el flujo
    res.setHeader('content-type', 'text/event-stream');
    res.setHeader('cache-control', 'no-cache, no-transform');
    res.setHeader('connection', 'keep-alive');
    res.setHeader('x-accel-buffering', 'no');
    res.flushHeaders();

    let closed = false;
    req.on('close', () => (closed = true));
    const deadline = Date.now() + 180_000;
    while (!closed && Date.now() < deadline) {
      const batch = await this.search.events(user.id, id, last);
      let finished = false;
      for (const e of batch) {
        last = Number(e.id);
        res.write(`id: ${e.id}\nevent: ${e.type}\ndata: ${JSON.stringify(e.payload)}\n\n`);
        if (TERMINAL_EVENTS.has(e.type)) finished = true;
      }
      if (finished) break;
      if (!batch.length) res.write(': ping\n\n');
      await new Promise((r) => setTimeout(r, 800));
    }
    res.end();
  }
}
