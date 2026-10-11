import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService, JwtUserPayload } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Body() body: RegisterDto) {
    const u = await this.auth.register({
      email: body.email,
      password: body.password,
      displayName: body.displayName,
    });
    const { accessToken, expiresInSec } = this.auth.signUser(u);
    return {
      accessToken,
      expiresInSec,
      user: { id: u.id, email: u.email, displayName: u.displayName },
    };
  }

  @Post('login')
  async login(@Body() body: LoginDto) {
    const u = await this.auth.validateUser(body.email, body.password);
    const { accessToken, expiresInSec } = this.auth.signUser(u);
    return {
      accessToken,
      expiresInSec,
      user: { id: u.id, email: u.email, displayName: u.displayName },
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() payload: JwtUserPayload) {
    const p = await this.auth.getUserProfile(payload.sub);
    return { userId: payload.sub, email: p.email, displayName: p.displayName };
  }
}
