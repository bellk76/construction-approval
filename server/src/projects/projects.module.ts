import { Module } from '@nestjs/common';
import { ProjectScopeService } from './project-scope.service';

@Module({
  providers: [ProjectScopeService],
  exports: [ProjectScopeService],
})
export class ProjectsModule {}
