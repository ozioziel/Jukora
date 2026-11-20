import { Module } from '@nestjs/common';
import { EscrowModule } from '../escrow/escrow.module';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';

@Module({ imports: [EscrowModule], controllers: [DisputesController], providers: [DisputesService] })
export class DisputesModule {}
