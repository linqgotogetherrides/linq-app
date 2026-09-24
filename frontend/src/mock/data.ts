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
