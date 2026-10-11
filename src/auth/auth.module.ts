import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SessionStartAuthGuard } from './session-start-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'dev-insecure-change-me'),
        signOptions: {
          expiresIn: parseInt(config.get<string>('JWT_EXPIRES_SEC', `${60 * 60 * 24 * 7}`), 10),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, SessionStartAuthGuard],
  exports: [AuthService, JwtModule, JwtAuthGuard, SessionStartAuthGuard],
})
export class AuthModule {}
