import { Module } from '@nestjs/common';
import { EscrowModule } from '../escrow/escrow.module';
import { LinksController } from './links.controller';
import { LinksService } from './links.service';

@Module({ imports: [EscrowModule], controllers: [LinksController], providers: [LinksService] })
export class LinksModule {}
