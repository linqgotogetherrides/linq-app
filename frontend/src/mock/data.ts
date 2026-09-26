import { Ride, User, Transaction, Reward, Notification, Conversation, Message } from '@/src/types';

export const currentUser: User = {
  id: '',
  name: '',
  phone: '',
  verification: 'not_verified',
};

export const mockRides: Ride[] = [];
export const mockTransactions: Transaction[] = [];
export const mockRewards: Reward[] = [];
export const mockNotifications: Notification[] = [];
// Chat is real: threads come from public.conversations, opened by an accepted
// ride request. See src/services/chatService.ts. Kept as empty types so the
// domain shape stays in one place.
export const mockConversations: Conversation[] = [];
export const mockMessages: Message[] = [];

export const hyderabadLocations = [
  'Madhapur, Hyderabad',
  'Hitech City',
  'Gachibowli',
  'Kukatpally',
  'Secunderabad',
  'Banjara Hills',
  'Jubilee Hills',
  'Ameerpet',
  'Begumpet',
  'Miyapur',
];
