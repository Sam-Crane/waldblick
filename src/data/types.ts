export type Priority = 'critical' | 'medium' | 'low';

export type Category = 'beetle' | 'thinning' | 'reforestation' | 'windthrow' | 'erosion' | 'machine' | 'other';

export type Status = 'open' | 'in_progress' | 'resolved';

export type Plot = {
  id: string;
  forestId?: string;
  name: string;
  // GeoJSON Polygon in WGS84: outer ring first, rings as [lng, lat] pairs.
  boundary: {
    type: 'Polygon';
    coordinates: [number, number][][];
  };
  color?: string;
};

export type Observation = {
  id: string;
  forestId?: string;
  plotId?: string;
  authorId?: string;
  category: Category;
  priority: Priority;
  status: Status;
  description: string;
  lat: number;
  lng: number;
  capturedAt: string; // ISO UTC
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

export type ObservationPhoto = {
  id: string;
  observationId: string;
  blob: Blob;
  width?: number;
  height?: number;
  capturedAt: string;
  storagePath?: string; // set once uploaded to Supabase Storage
};

export type ObservationAudio = {
  id: string;
  observationId: string;
  blob: Blob;
  mimeType: string;
  durationMs: number;
  capturedAt: string;
  storagePath?: string;
};

export type SyncOp = {
  id: string;
  kind: 'create' | 'update' | 'delete';
  entity: 'observation' | 'photo' | 'message';
  payload: unknown;
  createdAt: string;
  attempts: number;
  lastError?: string;
};

export type MachineKind = 'harvester' | 'forwarder' | 'maintenance' | 'other';

export type Machine = {
  id: string;
  userId: string;
  forestId?: string;
  kind: MachineKind;
  label?: string;
  lat: number;
  lng: number;
  heading?: number;
  lastSeenAt: string; // ISO UTC
};

export type Task = {
  id: string;
  observationId: string;
  assigneeId: string;
  dueAt?: string;
  completedAt?: string;
  createdAt: string;
};

export type Contact = {
  id: string;
  name: string;
  role: 'owner' | 'forester' | 'contractor' | 'operator';
  forestName?: string;
  avatarUrl?: string;
  online?: boolean;
};

export type Connection = {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: 'pending' | 'accepted' | 'blocked';
  createdAt: string;
  updatedAt: string;
};

export type Conversation = {
  id: string;
  participantA: string;
  participantB: string;
  lastMessageAt?: string;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  authorId: string;
  body: string;
  createdAt: string;
  observationId?: string;
  pending?: boolean;
};

export type NotificationKind =
  | 'critical_observation'
  | 'task_assigned'
  | 'message'
  | 'connection_request'
  | 'sync_issue'
  | 'user_joined';

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  targetPath?: string; // where to navigate on tap
};
