import { Module } from '@nestjs/common';
import { EscrowModule } from '../escrow/escrow.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({ imports: [EscrowModule], controllers: [OrdersController], providers: [OrdersService], exports: [OrdersService] })
export class OrdersModule {}
