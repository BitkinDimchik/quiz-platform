import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FontsController } from './fonts.controller';
import { SystemFontsService } from './system-fonts.service';

@Module({
  imports: [AuthModule],
  controllers: [FontsController],
  providers: [SystemFontsService],
  exports: [SystemFontsService],
})
export class FontsModule {}
