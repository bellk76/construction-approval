import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [CatalogController],
})
export class CatalogModule {}
