import {
  IsString,
  IsArray,
  IsBoolean,
  IsOptional,
  ArrayMinSize,
  ArrayMaxSize,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePollDto {
  @ApiProperty({ description: 'WhatsApp session ID' })
  @IsString()
  sessionId!: string;

  @ApiProperty({ description: 'Target chat or group JID (e.g. 12345678@g.us)' })
  @IsString()
  chatId!: string;

  @ApiPropertyOptional({ description: 'Display name of the target group or contact' })
  @IsOptional()
  @IsString()
  chatName?: string;

  @ApiProperty({ description: 'Question / title of the poll' })
  @IsString()
  @MaxLength(500)
  question!: string;

  @ApiProperty({ description: 'List of poll options (2 to 12)' })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(12)
  @IsString({ each: true })
  options!: string[];

  @ApiPropertyOptional({ description: 'Whether multiple options can be selected' })
  @IsOptional()
  @IsBoolean()
  allowMultipleAnswers?: boolean;

  @ApiPropertyOptional({ description: 'Keyword to identify the open option (default: otras)' })
  @IsOptional()
  @IsString()
  otherOptionKeyword?: string;

  @ApiPropertyOptional({ description: 'Enable recurring automatic citation reminders' })
  @IsOptional()
  @IsBoolean()
  citationEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Base daily repetition time in HH:mm (Chile time)' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'baseTime must be in HH:mm format' })
  baseTime?: string;

  @ApiPropertyOptional({ description: 'Up to 2 additional citation reminder times in HH:mm' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsString({ each: true })
  citationTimes?: string[];

  @ApiPropertyOptional({ description: 'End date for citation reminders (ISO string)' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Custom reminder message when quoting the poll' })
  @IsOptional()
  @IsString()
  reminderMessage?: string;
}

export class UpdatePollDto {
  @ApiPropertyOptional({ description: 'Status of the poll (active or closed)' })
  @IsOptional()
  @IsString()
  status?: 'active' | 'closed';

  @ApiPropertyOptional({ description: 'Enable or pause citation reminders' })
  @IsOptional()
  @IsBoolean()
  citationEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Base daily repetition time in HH:mm' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'baseTime must be in HH:mm format' })
  baseTime?: string;

  @ApiPropertyOptional({ description: 'Up to 2 additional citation reminder times in HH:mm' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsString({ each: true })
  citationTimes?: string[];

  @ApiPropertyOptional({ description: 'End date for citations (ISO string)' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Custom reminder message' })
  @IsOptional()
  @IsString()
  reminderMessage?: string;
}

export interface PollOptionResult {
  option: string;
  votes: number;
  percentage: number;
}

export interface PollDetailResponse {
  id: string;
  sessionId: string;
  chatId: string;
  chatName: string | null;
  messageId: string;
  question: string;
  options: string[];
  allowMultipleAnswers: boolean;
  status: 'active' | 'closed';
  citationEnabled: boolean;
  baseTime: string;
  citationTimes: string[];
  endDate: string | null;
  reminderMessage: string;
  lastCitedAt: string | null;
  totalVotes: number;
  optionResults: PollOptionResult[];
  otherResponsesCount: number;
  votes: Array<{
    id: string;
    voterJid: string;
    voterPhone: string | null;
    voterName: string | null;
    selectedOptions: string[];
    hasOther: boolean;
    customText: string | null;
    customTextReceivedAt: string | null;
    votedAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}
