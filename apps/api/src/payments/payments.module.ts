import { Module } from '@nestjs/common';
import { EscrowModule } from '../escrow/escrow.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({ imports: [EscrowModule], controllers: [PaymentsController], providers: [PaymentsService] })
export class PaymentsModule {}
