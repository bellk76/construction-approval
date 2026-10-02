import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('catalog')
@UseGuards(SessionGuard)
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('projects')
  projects() {
    return this.prisma.project.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } });
  }

  @Get('contractors')
  contractors() {
    return this.prisma.contractor.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } });
  }
}
