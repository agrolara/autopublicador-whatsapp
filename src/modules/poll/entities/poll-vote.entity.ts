import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Poll } from './poll.entity';

@Index('IDX_poll_votes_poll_voter', ['pollId', 'voterJid'], { unique: true })
@Entity('poll_votes')
export class PollVote {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  pollId!: string;

  @ManyToOne(() => Poll, poll => poll.votes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pollId' })
  poll!: Poll;

  @Column({ type: 'varchar', length: 150 })
  voterJid!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  voterPhone!: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  voterName!: string | null;

  @Column({ type: 'simple-json' })
  selectedOptions!: string[];

  @Column({ type: 'boolean', default: false })
  hasOther!: boolean;

  @Column({ type: 'text', nullable: true })
  customText!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  customTextReceivedAt!: Date | null;

  @CreateDateColumn()
  votedAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
