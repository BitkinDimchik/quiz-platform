import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SystemFontsService } from './system-fonts.service';

@Controller('api/fonts')
@UseGuards(JwtAuthGuard)
@SkipThrottle({ default: true, join: true })
export class FontsController {
  constructor(private readonly fonts: SystemFontsService) {}

  /** Все шрифты, установленные на машине с сервером (включая нестандартные). */
  @Get('system')
  async system(@Query('refresh') refresh?: string): Promise<{ families: string[] }> {
    const families = await this.fonts.listFamilies({ refresh: refresh === '1' });
    return { families };
  }
}
