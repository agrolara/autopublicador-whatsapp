import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { PollVote } from './poll-vote.entity';

@Index('IDX_polls_session_id', ['sessionId'])
@Index('IDX_polls_chat_id', ['chatId'])
@Index('IDX_polls_message_id', ['messageId'])
@Entity('polls')
export class Poll {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  sessionId!: string;

  @Column({ type: 'varchar', length: 150 })
  chatId!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  chatName!: string | null;

  @Column({ type: 'varchar', length: 255 })
  messageId!: string;

  @Column({ type: 'text' })
  question!: string;

  @Column({ type: 'simple-json' })
  options!: string[];

  @Column({ type: 'boolean', default: false })
  allowMultipleAnswers!: boolean;

  @Column({ type: 'varchar', length: 50, default: 'otras' })
  otherOptionKeyword!: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: 'active' | 'closed';

  // Citation & recurring schedule
  @Column({ type: 'boolean', default: false })
  citationEnabled!: boolean;

  @Column({ type: 'varchar', length: 10, default: '10:00' })
  baseTime!: string; // HH:mm in Chile timezone

  @Column({ type: 'simple-json', nullable: true })
  citationTimes!: string[] | null; // up to 2 extra times, e.g. ["14:00", "19:00"]

  @Column({ type: 'timestamp', nullable: true })
  endDate!: Date | null;

  @Column({ type: 'text', default: '📢 ¡Recordatorio! Recuerda participar y dejar tu voto en la encuesta de arriba ☝️' })
  reminderMessage!: string;

  @Column({ type: 'timestamp', nullable: true })
  lastCitedAt!: Date | null;

  @OneToMany(() => PollVote, vote => vote.poll, { cascade: true })
  votes!: PollVote[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
