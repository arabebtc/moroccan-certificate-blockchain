import { EventEmitter } from 'eventemitter3';
import { Block } from '@mcb/shared';

export class ChonkyBFTConsensus extends EventEmitter {
  private currentView: number = 0;
  
  constructor(private validatorAddress: string) {
    super();
  }

  async start(): Promise<void> {
    console.log('Starting ChonkyBFT consensus...');
    this.emit('started');
  }

  async proposeBlock(block: Block): Promise<void> {
    console.log(`Proposing block ${block.number}`);
    this.emit('blockProposed', block);
  }
}
