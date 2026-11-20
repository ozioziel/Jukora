import { Module } from '@nestjs/common';
import { EscrowService } from './escrow.service';
import { StellarService } from './stellar.service';
import { TwClient } from './tw.client';

@Module({
  providers: [EscrowService, StellarService, TwClient],
  exports: [EscrowService, StellarService],
})
export class EscrowModule {}
