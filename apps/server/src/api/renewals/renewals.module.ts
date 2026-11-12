import { Module } from '@nestjs/common';
import {
  AuditController,
  OverviewController,
  RenewalsController,
  ResourcesController,
} from './controllers';
import { CommandsService } from './commands.service';
import { ReadModel } from './read-model';

@Module({
  controllers: [ResourcesController, RenewalsController, AuditController, OverviewController],
  providers: [ReadModel, CommandsService],
})
export class RenewalsModule {}
