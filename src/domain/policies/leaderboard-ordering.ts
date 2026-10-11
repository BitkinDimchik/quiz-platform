import { SessionPlayer } from '../../entities/session-player.entity';

export function rankPlayers(players: SessionPlayer[]): SessionPlayer[] {
  return [...players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase());
  });
}
