export interface ConsensusMessage {
  type: 'prepare' | 'commit' | 'view-change';
  view: number;
  sender: string;
}
