import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { DomainError } from '../common/domain-error';
import { User } from '../entities/user.entity';

export type JwtUserPayload = { sub: string; email: string };

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly jwt: JwtService,
  ) {}

  validateAccessToken(token: string): JwtUserPayload {
    return this.jwt.verify<JwtUserPayload>(token);
  }

  async register(input: { email: string; password: string; displayName?: string | null }): Promise<User> {
    const email = input.email.trim().toLowerCase();
    const exists = await this.users.findOne({ where: { email } });
    if (exists) throw DomainError.conflict('email already registered');
    const hash = await bcrypt.hash(input.password, 10);
    const u = this.users.create({
      email,
      passwordHash: hash,
      displayName: input.displayName?.trim() || null,
    });
    return this.users.save(u);
  }

  async validateUser(email: string, password: string): Promise<User> {
    const u = await this.users.findOne({ where: { email: email.trim().toLowerCase() } });
    if (!u) throw DomainError.notFound('user');
    const ok = await bcrypt.compare(password, u.passwordHash);
    if (!ok) throw DomainError.unauthorized('invalid credentials');
    return u;
  }

  signUser(u: User): { accessToken: string; expiresInSec: number } {
    const payload: JwtUserPayload = { sub: u.id, email: u.email };
    const accessToken = this.jwt.sign(payload);
    const expiresInSec = 60 * 60 * 24 * 7;
    return { accessToken, expiresInSec };
  }

  async getUserProfile(userId: string): Promise<{ email: string; displayName: string | null }> {
    const u = await this.users.findOne({ where: { id: userId } });
    if (!u) throw DomainError.unauthorized('user not found');
    return { email: u.email, displayName: u.displayName };
  }
}
