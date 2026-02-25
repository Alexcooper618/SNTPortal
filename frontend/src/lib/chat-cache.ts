const ROOMS_TTL_MS = 30_000;
const CONTACTS_TTL_MS = 30_000;
const MESSAGES_TTL_MS = 20_000;

interface CachedCollection<T> {
  items: T[];
  fetchedAt: number;
}

const isFresh = (fetchedAt: number, ttlMs: number) => Date.now() - fetchedAt <= ttlMs;

const state: {
  tenantSlug: string | null;
  rooms: CachedCollection<unknown> | null;
  contacts: CachedCollection<unknown> | null;
  messagesByRoom: Map<string, CachedCollection<unknown>>;
  lastSelectedRoomId: string | null;
} = {
  tenantSlug: null,
  rooms: null,
  contacts: null,
  messagesByRoom: new Map(),
  lastSelectedRoomId: null,
};

export const chatCache = {
  ttlMs: {
    rooms: ROOMS_TTL_MS,
    contacts: CONTACTS_TTL_MS,
    messages: MESSAGES_TTL_MS,
  },

  ensureTenant(tenantSlug: string) {
    if (state.tenantSlug === tenantSlug) return;
    state.tenantSlug = tenantSlug;
    state.rooms = null;
    state.contacts = null;
    state.messagesByRoom.clear();
    state.lastSelectedRoomId = null;
  },

  getRooms<T>(): T[] | null {
    if (!state.rooms || !isFresh(state.rooms.fetchedAt, ROOMS_TTL_MS)) return null;
    return state.rooms.items as T[];
  },

  peekRooms<T>(): T[] | null {
    return state.rooms ? (state.rooms.items as T[]) : null;
  },

  setRooms<T>(items: T[]) {
    state.rooms = {
      items,
      fetchedAt: Date.now(),
    };
  },

  getContacts<T>(): T[] | null {
    if (!state.contacts || !isFresh(state.contacts.fetchedAt, CONTACTS_TTL_MS)) return null;
    return state.contacts.items as T[];
  },

  peekContacts<T>(): T[] | null {
    return state.contacts ? (state.contacts.items as T[]) : null;
  },

  setContacts<T>(items: T[]) {
    state.contacts = {
      items,
      fetchedAt: Date.now(),
    };
  },

  getMessages<T>(roomId: string): T[] | null {
    const entry = state.messagesByRoom.get(roomId);
    if (!entry || !isFresh(entry.fetchedAt, MESSAGES_TTL_MS)) return null;
    return entry.items as T[];
  },

  peekMessages<T>(roomId: string): T[] | null {
    const entry = state.messagesByRoom.get(roomId);
    return entry ? (entry.items as T[]) : null;
  },

  setMessages<T>(roomId: string, items: T[]) {
    state.messagesByRoom.set(roomId, {
      items,
      fetchedAt: Date.now(),
    });
  },

  invalidateRoom(roomId: string) {
    state.messagesByRoom.delete(roomId);
  },

  get lastSelectedRoomId() {
    return state.lastSelectedRoomId;
  },

  set lastSelectedRoomId(value: string | null) {
    state.lastSelectedRoomId = value;
  },
};
