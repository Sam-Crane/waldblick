// Mocked data for Messaging + Notifications UI. Replaced by Supabase-backed
// repositories in a later phase. Single source for the stubs so we can swap
// them out in one place.

import type { AppNotification, ChatMessage, Contact, Plot } from './types';

// Demo conversations in mocks have a simpler preview-oriented shape than
// the Supabase-backed Conversation. Kept here so the Messages/Conversation
// screens can render something in demo mode.
export type MockConversation = {
  id: string;
  participantId: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  unreadCount: number;
};

export const CONTACTS: Contact[] = [
  {
    id: 'c-lisa',
    name: 'Lisa Maier',
    role: 'forester',
    forestName: 'Revier Eichberg',
    online: true,
  },
  {
    id: 'c-tobias',
    name: 'Tobias Huber',
    role: 'contractor',
    forestName: 'Huber Forstbetrieb',
    online: false,
  },
  {
    id: 'c-anna',
    name: 'Anna Wagner',
    role: 'owner',
    forestName: 'Wagner-Wald',
    online: true,
  },
];

export const CONVERSATIONS: MockConversation[] = [
  {
    id: 'conv-1',
    participantId: 'c-tobias',
    lastMessageAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    lastMessagePreview: 'Können wir morgen um 7:30 starten?',
    unreadCount: 2,
  },
  {
    id: 'conv-2',
    participantId: 'c-lisa',
    lastMessageAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    lastMessagePreview: 'Markierung am Osthang ist weg — foto folgt.',
    unreadCount: 0,
  },
  {
    id: 'conv-3',
    participantId: 'c-anna',
    lastMessageAt: new Date(Date.now() - 28 * 60 * 60 * 1000).toISOString(),
    lastMessagePreview: 'Danke für den Hinweis zum Borkenkäfer.',
    unreadCount: 0,
  },
];

export const MESSAGES_BY_CONVERSATION: Record<string, ChatMessage[]> = {
  'conv-1': [
    {
      id: 'm-1',
      conversationId: 'conv-1',
      authorId: 'c-tobias',
      body: 'Hi Lukas, bin morgen mit dem Harvester im Revier.',
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'm-2',
      conversationId: 'conv-1',
      authorId: 'demo-user',
      body: 'Perfekt. Die Markierungen hab ich nochmal gecheckt.',
      createdAt: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
    },
    {
      id: 'm-3',
      conversationId: 'conv-1',
      authorId: 'c-tobias',
      body: 'Können wir morgen um 7:30 starten?',
      createdAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    },
  ],
  'conv-2': [
    {
      id: 'm-4',
      conversationId: 'conv-2',
      authorId: 'c-lisa',
      body: 'Markierung am Osthang ist weg — foto folgt.',
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    },
  ],
  'conv-3': [
    {
      id: 'm-5',
      conversationId: 'conv-3',
      authorId: 'c-anna',
      body: 'Danke für den Hinweis zum Borkenkäfer.',
      createdAt: new Date(Date.now() - 28 * 60 * 60 * 1000).toISOString(),
    },
  ],
};

export const NOTIFICATIONS: AppNotification[] = [
  {
    id: 'n-1',
    kind: 'critical_observation',
    title: 'Neue kritische Beobachtung',
    body: 'Borkenkäfer nahe Sektor 7-G gemeldet.',
    createdAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    read: false,
    targetPath: '/tasks',
  },
  {
    id: 'n-2',
    kind: 'message',
    title: 'Tobias Huber',
    body: 'Können wir morgen um 7:30 starten?',
    createdAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    read: false,
    targetPath: '/messages/conv-1',
  },
  {
    id: 'n-3',
    kind: 'task_assigned',
    title: 'Aufgabe zugewiesen',
    body: 'Durchforstung Plot B-14 — geplant für Donnerstag.',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    read: true,
    targetPath: '/tasks',
  },
];

export function contactById(id: string): Contact | undefined {
  return CONTACTS.find((c) => c.id === id);
}

// Seed plots — two small Bavarian parcels near the default map center.
// In production these would come from admin-drawn polygons in Supabase.
export const PLOTS: Plot[] = [
  {
    id: 'plot-eichberg-a',
    name: 'Plot A — Eichberg',
    color: '#173124',
    boundary: {
      type: 'Polygon',
      coordinates: [
        [
          [11.56, 48.145],
          [11.585, 48.145],
          [11.585, 48.13],
          [11.56, 48.13],
          [11.56, 48.145],
        ],
      ],
    },
  },
  {
    id: 'plot-eichberg-b',
    name: 'Plot B — Osthang',
    color: '#765840',
    boundary: {
      type: 'Polygon',
      coordinates: [
        [
          [11.6, 48.15],
          [11.625, 48.148],
          [11.63, 48.132],
          [11.605, 48.128],
          [11.6, 48.15],
        ],
      ],
    },
  },
];
