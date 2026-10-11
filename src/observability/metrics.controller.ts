import { Controller, Get, Header, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { MetricsService } from './metrics.service';

@Controller('metrics')
@SkipThrottle({ default: true, join: true })
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  /** Prometheus scrape (доступ ограничить на уровне сети / ingress). */
  @Get()
  @Header('Cache-Control', 'no-store')
  async scrape(@Res() res: Response): Promise<void> {
    res.set('Content-Type', this.metrics.registry.contentType);
    res.send(await this.metrics.registry.metrics());
  }
}
