import { IsOptional, IsString, MaxLength, MinLength, Matches, ValidateIf } from 'class-validator';
import { AVATAR_URL_RE } from '../avatar-url.util';

export class SessionJoinDto {
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  @Matches(/^[A-Za-z0-9]+$/)
  roomCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName!: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== '' && v != null)
  @IsString()
  @MaxLength(2048)
  @Matches(AVATAR_URL_RE, {
    message: 'avatarUrl must be emoji:… or /uploads/avatar/…',
  })
  avatarUrl?: string | null;
}
