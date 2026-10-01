import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Poll } from './entities/poll.entity';
import { PollVote } from './entities/poll-vote.entity';
import { PollService } from './poll.service';
import { PollController } from './poll.controller';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Poll, PollVote], 'data'),
  ],
  controllers: [PollController],
  providers: [PollService],
  exports: [PollService],
})
export class PollModule {}
