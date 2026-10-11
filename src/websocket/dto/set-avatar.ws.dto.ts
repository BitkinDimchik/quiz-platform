import { IsString, Matches, MaxLength } from 'class-validator';
import { AVATAR_URL_RE } from '../../session/avatar-url.util';

export class SetAvatarWsDto {
  @IsString()
  @MaxLength(2048)
  @Matches(AVATAR_URL_RE, {
    message: 'avatarUrl must be emoji:… or /uploads/avatar/…',
  })
  avatarUrl!: string;
}
