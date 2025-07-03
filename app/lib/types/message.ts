import { User } from '@/app/lib/types';

export interface IMessage {
  id: string;
  user: User;
  content: string;
  createdAt: Date;
}
