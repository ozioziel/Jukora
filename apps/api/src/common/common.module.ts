import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  providers: [NotificationsService, AccessService],
  exports: [NotificationsService, AccessService],
})
export class CommonModule {}
