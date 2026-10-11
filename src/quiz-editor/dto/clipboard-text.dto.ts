import { IsString, MaxLength, MinLength } from 'class-validator';
import { OS_CLIPBOARD_TEXT_MAX } from '../os-clipboard-text';

export class ClipboardTextDto {
  @IsString()
  @MinLength(1)
  @MaxLength(OS_CLIPBOARD_TEXT_MAX)
  text!: string;
}
