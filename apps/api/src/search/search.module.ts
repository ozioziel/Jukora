import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { AiService } from './ai/ai.service';
import { QuotaService } from './quota.service';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { CatalogSource } from './sources/catalog.source';
import { TavilySource } from './sources/tavily.source';

@Module({
  imports: [ProjectsModule],
  controllers: [SearchController],
  providers: [SearchService, QuotaService, AiService, CatalogSource, TavilySource],
  exports: [SearchService],
})
export class SearchModule {}
