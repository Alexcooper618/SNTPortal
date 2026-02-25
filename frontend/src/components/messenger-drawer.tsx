"use client";

import { FormEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CornerUpLeft, Maximize2, Minimize2, Pencil, Trash2, X } from "lucide-react";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { chatCache } from "@/lib/chat-cache";
import { loadSession, SessionState } from "@/lib/session";

type RoomId = string;

const EDIT_WINDOW_MS = 15 * 60 * 1000;
const GROUP_WINDOW_MS = 3 * 60 * 1000;

interface ChatUser {
  id: number;
  name: string;
  phone?: string;
  role: "USER" | "CHAIRMAN" | "ADMIN";
  ownedPlots?: Array<{ id: number; number: string }>;
}

interface ContactListResponse {
  items: ChatUser[];
}

interface ChatRoomMember {
  id: number;
  user: ChatUser;
}

interface ChatMessage {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  isEdited: boolean;
  editedAt: string | null;
  isDeleted: boolean;
  replyTo: {
    id: string;
    bodyPreview: string;
    authorName: string;
    isDeleted: boolean;
  } | null;
  author: {
    id: number;
    name: string;
    role: "USER" | "CHAIRMAN" | "ADMIN";
  };
}

interface ChatMessageVm extends ChatMessage {
  createdAtMs: number;
  timeShort: string;
  timeFull: string;
}

interface ChatRoomItem {
  id: string;
  name: string;
  isPrivate: boolean;
  updatedAt: string;
  createdAt: string;
  members: ChatRoomMember[];
  lastMessage: ChatMessage | null;
  unreadCount: number;
  lastReadAt?: string | null;
}

interface RoomsResponse {
  items: ChatRoomItem[];
  summary?: {
    unreadRooms: number;
    unreadMessages: number;
  };
}

interface RoomMessagesResponse {
  room: {
    id: string;
    name: string;
    isPrivate: boolean;
  };
  items: ChatMessage[];
}

interface DirectRoomResponse {
  room: {
    id: string;
    name: string;
    isPrivate: boolean;
    members: ChatRoomMember[];
  } | null;
}

type MessengerDrawerProps =
  | {
      variant?: "widget";
      open: boolean;
      onClose: () => void;
      session: SessionState;
    }
  | {
      variant: "page";
      session: SessionState;
    };

const normalizeError = (error: unknown, fallback: string) => {
  if (!(error instanceof ApiRequestError)) return fallback;
  return error.message;
};

const roomLabel = (room: ChatRoomItem | null, myUserId: number) => {
  if (!room) return "";
  if (!room.isPrivate) return room.name;
  const other = room.members.map((member) => member.user).find((user) => user.id !== myUserId);
  return other ? other.name : "Личный чат";
};

const roomKindLabel = (room: ChatRoomItem | null) => {
  if (!room) return "";
  return room.isPrivate ? "Личный чат" : "Топик";
};

const mentionAlias = (user: ChatUser) => user.name.trim().replace(/\s+/g, "_");

const renderBodyWithMentions = (body: string) => {
  const chunks = body.split(/(@[^\s@]{1,64})/g);
  return chunks.map((chunk, index) => {
    if (/^@[^\s@]{1,64}$/.test(chunk)) {
      return (
        <span key={`${chunk}-${index}`} className="msg-mention">
          {chunk}
        </span>
      );
    }

    return <span key={`${chunk}-${index}`}>{chunk}</span>;
  });
};

const toMessageVm = (message: ChatMessage): ChatMessageVm => {
  const date = new Date(message.createdAt);
  const createdAtMs = Number.isNaN(date.getTime()) ? Date.now() : date.getTime();

  return {
    ...message,
    createdAtMs,
    timeShort: date.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    timeFull: date.toLocaleString("ru-RU"),
  };
};

const toMessageVms = (items: ChatMessage[]) => items.map(toMessageVm);

interface MessageItemProps {
  message: ChatMessageVm;
  mine: boolean;
  grouped: boolean;
  isTopic: boolean;
  showAuthor: boolean;
  showAvatar: boolean;
  needsAvatarSpacer: boolean;
  showInlineMessageActions: boolean;
  actionOpen: boolean;
  canReply: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onToggleAction: (messageId: string) => void;
  onReply: (message: ChatMessageVm) => void;
  onEdit: (message: ChatMessageVm) => void;
  onDelete: (messageId: string) => void;
  onLongPressStart: (messageId: string) => void;
  onLongPressEnd: () => void;
}

const MessageItem = memo(function MessageItem(props: MessageItemProps) {
  const {
    message,
    mine,
    grouped,
    isTopic,
    showAuthor,
    showAvatar,
    needsAvatarSpacer,
    showInlineMessageActions,
    actionOpen,
    canReply,
    canEdit,
    canDelete,
    onToggleAction,
    onReply,
    onEdit,
    onDelete,
    onLongPressStart,
    onLongPressEnd,
  } = props;

  const body = (
    <>
      {message.replyTo ? (
        <div className="msg-reply">
          <p className="msg-reply-author">{message.replyTo.authorName}</p>
          <p className="msg-reply-body">{message.replyTo.bodyPreview}</p>
        </div>
      ) : null}
      {showAuthor ? <p className="msg-author">{message.author.name}</p> : null}
      <p className="msg-body">{renderBodyWithMentions(message.body)}</p>
      <div className="msg-meta-row">
        <p className="msg-time" title={message.timeFull}>
          {message.timeShort}
          {message.isEdited ? " · изм." : ""}
        </p>
        {showInlineMessageActions && (canReply || canEdit || canDelete) && !message.isDeleted ? (
          <button
            type="button"
            className="msg-more"
            onClick={() => onToggleAction(message.id)}
            aria-label="Действия с сообщением"
            title="Действия"
          >
            •••
          </button>
        ) : null}
      </div>
      {actionOpen ? (
        <div className="msg-actions-menu">
          {canReply ? (
            <button type="button" onClick={() => onReply(message)}>
              <CornerUpLeft size={14} /> Ответить
            </button>
          ) : null}
          {canEdit ? (
            <button type="button" onClick={() => onEdit(message)}>
              <Pencil size={14} /> Редактировать
            </button>
          ) : null}
          {canDelete ? (
            <button type="button" onClick={() => onDelete(message.id)}>
              <Trash2 size={14} /> Удалить
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );

  return (
    <div
      className={["msg-row", mine ? "mine" : "", grouped ? "grouped" : ""].filter(Boolean).join(" ")}
      onTouchStart={() => onLongPressStart(message.id)}
      onTouchEnd={onLongPressEnd}
      onTouchMove={onLongPressEnd}
      onContextMenu={(event) => {
        event.preventDefault();
        onToggleAction(message.id);
      }}
    >
      {!mine && isTopic ? (
        <div className="msg-stack">
          {showAvatar ? (
            <span className="msg-avatar-small" aria-hidden="true">
              {message.author.name.slice(0, 1).toUpperCase()}
            </span>
          ) : needsAvatarSpacer ? (
            <span className="msg-avatar-spacer" aria-hidden="true" />
          ) : null}
          <div className={["msg-bubble", grouped ? "grouped" : ""].filter(Boolean).join(" ")}>{body}</div>
        </div>
      ) : (
        <div className={["msg-bubble", mine ? "mine" : "", grouped ? "grouped" : ""].filter(Boolean).join(" ")}>{body}</div>
      )}
    </div>
  );
});

export function MessengerDrawer(props: MessengerDrawerProps) {
  const router = useRouter();
  const isPage = props.variant === "page";
  const open = isPage ? true : props.open;
  const onClose = isPage ? null : props.onClose;
  const session = props.session;

  const [mode, setMode] = useState<"topics" | "contacts">("topics");
  const [rooms, setRooms] = useState<ChatRoomItem[]>([]);
  const [contacts, setContacts] = useState<ChatUser[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<RoomId | null>(null);
  const [messages, setMessages] = useState<ChatMessageVm[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [newTopicName, setNewTopicName] = useState("");
  const [expanded, setExpanded] = useState(isPage);
  const [view, setView] = useState<"list" | "chat">("list");
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [actionMessageId, setActionMessageId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessageVm | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [cursorPosition, setCursorPosition] = useState(0);

  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [isRoomSwitching, setIsRoomSwitching] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isMutatingMessage, setIsMutatingMessage] = useState(false);
  const [isOpeningDirect, setIsOpeningDirect] = useState(false);
  const [isCreatingTopic, setIsCreatingTopic] = useState(false);
  const [hasLoadedCurrentRoom, setHasLoadedCurrentRoom] = useState(false);

  const messagesRef = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const pinnedToBottomRef = useRef(true);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightMessagesRef = useRef<Map<RoomId, Promise<ChatMessageVm[]>>>(new Map());
  const selectedRoomIdRef = useRef<RoomId | null>(null);
  const activeRequestSeqRef = useRef(0);

  const compact = (!isPage && !expanded) || (isPage && isMobileViewport);
  const showList = !compact || view === "list";
  const showChat = !compact || view === "chat";
  const showInlineMessageActions = !isMobileViewport;

  const syncDraftHeight = useCallback(() => {
    const textarea = draftRef.current;
    if (!textarea || typeof window === "undefined") return;

    if (!isMobileViewport) {
      textarea.style.height = "";
      textarea.style.overflowY = "";
      return;
    }

    textarea.style.height = "auto";
    const computed = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computed.lineHeight) || 21;
    const paddingTop = Number.parseFloat(computed.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(computed.paddingBottom) || 0;
    const maxHeight = lineHeight * 3 + paddingTop + paddingBottom;
    const targetHeight = Math.max(48, Math.min(textarea.scrollHeight, maxHeight));
    textarea.style.height = `${targetHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [isMobileViewport]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 980px)");
    const syncViewport = () => setIsMobileViewport(mediaQuery.matches);

    syncViewport();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncViewport);
      return () => mediaQuery.removeEventListener("change", syncViewport);
    }

    mediaQuery.addListener(syncViewport);
    return () => mediaQuery.removeListener(syncViewport);
  }, []);

  useEffect(() => {
    if (!showChat) return;
    syncDraftHeight();
  }, [draft, showChat, syncDraftHeight]);

  useEffect(
    () => () => {
      if (!longPressRef.current) return;
      clearTimeout(longPressRef.current);
    },
    []
  );

  useEffect(() => {
    selectedRoomIdRef.current = selectedRoomId;
    if (selectedRoomId) {
      chatCache.lastSelectedRoomId = selectedRoomId;
    }
  }, [selectedRoomId]);

  const authOptions = useCallback(() => {
    const latest = loadSession();
    return {
      token: latest?.accessToken ?? session.accessToken,
      tenantSlug: latest?.tenantSlug ?? session.tenantSlug,
    };
  }, [session.accessToken, session.tenantSlug]);

  const setRoomsWithCache = useCallback(
    (updater: ChatRoomItem[] | ((prev: ChatRoomItem[]) => ChatRoomItem[])) => {
      setRooms((prev) => {
        const next =
          typeof updater === "function"
            ? (updater as (prev: ChatRoomItem[]) => ChatRoomItem[])(prev)
            : updater;
        chatCache.setRooms(next);
        return next;
      });
    },
    []
  );

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId]
  );

  const editingMessage = useMemo(
    () => messages.find((message) => message.id === editingMessageId) ?? null,
    [messages, editingMessageId]
  );

  const mentionContext = useMemo(() => {
    if (!selectedRoom || selectedRoom.isPrivate) return null;
    const safeCursor = Math.max(0, Math.min(cursorPosition, draft.length));
    const beforeCursor = draft.slice(0, safeCursor);
    const match = beforeCursor.match(/(^|\s)@([^\s@]*)$/u);
    if (!match) return null;

    const query = match[2] ?? "";
    const start = beforeCursor.length - query.length - 1;
    if (start < 0) return null;

    return { query, start, end: safeCursor };
  }, [cursorPosition, draft, selectedRoom]);

  const mentionSuggestions = useMemo(() => {
    if (!mentionContext) return [];
    const needle = mentionContext.query.toLowerCase().replace(/_/g, " ").trim();

    return contacts
      .filter((user) => {
        if (!needle) return true;
        const byName = user.name.toLowerCase().includes(needle);
        const byPhone = (user.phone ?? "").toLowerCase().includes(needle);
        return byName || byPhone;
      })
      .slice(0, 6);
  }, [contacts, mentionContext]);

  const visibleRooms = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rooms;
    return rooms.filter((room) => {
      const label = roomLabel(room, session.user.id).toLowerCase();
      const last = room.lastMessage?.body?.toLowerCase() ?? "";
      return label.includes(term) || last.includes(term);
    });
  }, [rooms, search, session.user.id]);

  const visibleTopics = useMemo(() => visibleRooms.filter((room) => !room.isPrivate), [visibleRooms]);
  const visibleDirects = useMemo(() => visibleRooms.filter((room) => room.isPrivate), [visibleRooms]);

  const visibleContacts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter((contact) => contact.name.toLowerCase().includes(term));
  }, [contacts, search]);

  const resetComposeState = useCallback(() => {
    setDraft("");
    setReplyTo(null);
    setEditingMessageId(null);
    setActionMessageId(null);
    setCursorPosition(0);
  }, []);

  const loadRooms = useCallback(
    async (options?: { force?: boolean }) => {
      if (!options?.force) {
        const cachedRooms = chatCache.getRooms<ChatRoomItem>();
        if (cachedRooms) {
          setRooms(cachedRooms);
          return cachedRooms;
        }
      }

      const response = await apiRequest<RoomsResponse>("/chat/rooms", {
        ...authOptions(),
      });
      chatCache.setRooms(response.items);
      setRooms(response.items);
      return response.items;
    },
    [authOptions]
  );

  const loadContacts = useCallback(
    async (options?: { force?: boolean }) => {
      if (!options?.force) {
        const cachedContacts = chatCache.getContacts<ChatUser>();
        if (cachedContacts) {
          setContacts(cachedContacts);
          return cachedContacts;
        }
      }

      const response = await apiRequest<ContactListResponse>("/chat/contacts", {
        ...authOptions(),
      });
      chatCache.setContacts(response.items);
      setContacts(response.items);
      return response.items;
    },
    [authOptions]
  );

  const fetchRoomMessages = useCallback(
    async (roomId: string, options?: { force?: boolean }) => {
      if (!options?.force) {
        const cachedMessages = chatCache.getMessages<ChatMessageVm>(roomId);
        if (cachedMessages) return cachedMessages;
      }

      const inflight = inflightMessagesRef.current.get(roomId);
      if (inflight) return inflight;

      const request = apiRequest<RoomMessagesResponse>(`/chat/rooms/${roomId}/messages`, {
        ...authOptions(),
      })
        .then((response) => {
          const normalized = toMessageVms(response.items);
          chatCache.setMessages(roomId, normalized);
          return normalized;
        })
        .finally(() => {
          inflightMessagesRef.current.delete(roomId);
        });

      inflightMessagesRef.current.set(roomId, request);
      return request;
    },
    [authOptions]
  );

  const setRoomReadOptimistic = useCallback(
    (roomId: string, readAt?: string) => {
      setRoomsWithCache((prev) =>
        prev.map((room) =>
          room.id === roomId
            ? {
                ...room,
                unreadCount: 0,
                lastReadAt: readAt ?? room.lastReadAt ?? new Date().toISOString(),
              }
            : room
        )
      );

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("snt:chat-summary-invalidated"));
      }
    },
    [setRoomsWithCache]
  );

  const markRead = useCallback(
    async (roomId: string, readAt: string | undefined) => {
      try {
        await apiRequest(`/chat/rooms/${roomId}/read`, {
          method: "POST",
          ...authOptions(),
          body: readAt ? { readAt } : {},
        });
        setRoomReadOptimistic(roomId, readAt);
      } catch (_error) {
        // Non-critical.
      }
    },
    [authOptions, setRoomReadOptimistic]
  );

  const prefetchRoomMessages = useCallback(
    (roomId: string) => {
      void fetchRoomMessages(roomId).catch(() => {
        // Non-critical prefetch.
      });
    },
    [fetchRoomMessages]
  );

  const loadSelectedRoomMessages = useCallback(
    async (roomId: string) => {
      const requestSeq = activeRequestSeqRef.current + 1;
      activeRequestSeqRef.current = requestSeq;
      setError(null);

      const cached = chatCache.getMessages<ChatMessageVm>(roomId);
      if (cached) {
        setMessages(cached);
        setHasLoadedCurrentRoom(true);
        setIsRoomSwitching(false);
        const lastCached = cached.at(-1)?.createdAt;
        setRoomReadOptimistic(roomId, lastCached);
        void markRead(roomId, lastCached);

        try {
          const refreshed = await fetchRoomMessages(roomId, { force: true });
          if (activeRequestSeqRef.current !== requestSeq || selectedRoomIdRef.current !== roomId) return;
          setMessages(refreshed);
          setHasLoadedCurrentRoom(true);
          const lastRefreshed = refreshed.at(-1)?.createdAt;
          setRoomReadOptimistic(roomId, lastRefreshed);
          void markRead(roomId, lastRefreshed);
        } catch (requestError) {
          if (activeRequestSeqRef.current !== requestSeq || selectedRoomIdRef.current !== roomId) return;
          setError(normalizeError(requestError, "Не удалось обновить сообщения"));
        }
        return;
      }

      setIsRoomSwitching(true);
      setHasLoadedCurrentRoom(false);
      setMessages([]);

      try {
        const loaded = await fetchRoomMessages(roomId, { force: true });
        if (activeRequestSeqRef.current !== requestSeq || selectedRoomIdRef.current !== roomId) return;
        setMessages(loaded);
        setHasLoadedCurrentRoom(true);
        const lastLoaded = loaded.at(-1)?.createdAt;
        setRoomReadOptimistic(roomId, lastLoaded);
        void markRead(roomId, lastLoaded);
      } catch (requestError) {
        if (activeRequestSeqRef.current !== requestSeq || selectedRoomIdRef.current !== roomId) return;
        setError(normalizeError(requestError, "Не удалось загрузить сообщения"));
      } finally {
        if (activeRequestSeqRef.current === requestSeq && selectedRoomIdRef.current === roomId) {
          setIsRoomSwitching(false);
        }
      }
    },
    [fetchRoomMessages, markRead, setRoomReadOptimistic]
  );

  const focusDraft = useCallback((cursor?: number) => {
    const textarea = draftRef.current;
    if (!textarea) return;

    textarea.focus();
    if (typeof cursor === "number") {
      textarea.setSelectionRange(cursor, cursor);
      setCursorPosition(cursor);
    }
  }, []);

  const selectRoom = useCallback(
    (roomId: string) => {
      setSelectedRoomId(roomId);
      chatCache.lastSelectedRoomId = roomId;
      if (compact) setView("chat");
    },
    [compact]
  );

  useEffect(() => {
    if (!open) return;
    chatCache.ensureTenant(session.tenantSlug);
    setError(null);

    const hasRooms = Boolean(chatCache.getRooms<ChatRoomItem>());
    const hasContacts = Boolean(chatCache.getContacts<ChatUser>());
    setIsBootstrapping(!(hasRooms && hasContacts));

    let cancelled = false;
    Promise.all([loadRooms(), loadContacts()])
      .catch((requestError) => {
        if (cancelled) return;
        setError(normalizeError(requestError, "Не удалось загрузить чат"));
      })
      .finally(() => {
        if (!cancelled) setIsBootstrapping(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, loadRooms, loadContacts, session.tenantSlug]);

  useEffect(() => {
    if (!open) return;
    if (rooms.length === 0) {
      setSelectedRoomId(null);
      setMessages([]);
      setHasLoadedCurrentRoom(false);
      return;
    }

    setSelectedRoomId((current) => {
      if (current && rooms.some((room) => room.id === current)) return current;
      const preferred = chatCache.lastSelectedRoomId;
      if (preferred && rooms.some((room) => room.id === preferred)) return preferred;
      return rooms[0].id;
    });
  }, [open, rooms]);

  useEffect(() => {
    if (!open || !selectedRoomId) return;
    resetComposeState();
    pinnedToBottomRef.current = true;
    void loadSelectedRoomMessages(selectedRoomId);
  }, [open, selectedRoomId, loadSelectedRoomMessages, resetComposeState]);

  useEffect(() => {
    if (!open || rooms.length === 0 || typeof window === "undefined") return;

    const candidates = rooms
      .filter((room) => room.id !== selectedRoomId)
      .slice(0, 2)
      .map((room) => room.id);
    if (candidates.length === 0) return;

    const timeoutId = window.setTimeout(() => {
      candidates.forEach((roomId) => prefetchRoomMessages(roomId));
    }, 120);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [open, rooms, selectedRoomId, prefetchRoomMessages]);

  useEffect(() => {
    if (!open || !showChat) return;
    const element = messagesRef.current;
    if (!element) return;
    if (pinnedToBottomRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages, open, showChat]);

  useEffect(() => {
    if (!editingMessage) return;
    setDraft(editingMessage.body);
    focusDraft(editingMessage.body.length);
  }, [editingMessage, focusDraft]);

  const applyMention = useCallback(
    (user: ChatUser) => {
      if (!mentionContext) return;
      const alias = mentionAlias(user);
      const token = `@${alias}`;
      const nextDraft = `${draft.slice(0, mentionContext.start)}${token} ${draft.slice(mentionContext.end)}`;
      const nextCursor = mentionContext.start + token.length + 1;
      setDraft(nextDraft);
      window.requestAnimationFrame(() => focusDraft(nextCursor));
    },
    [draft, focusDraft, mentionContext]
  );

  const send = useCallback(
    async (event?: FormEvent) => {
      if (event) event.preventDefault();
      if (!selectedRoomId) return;

      const body = draft.trim();
      if (!body) return;

      const roomId = selectedRoomId;
      setError(null);
      setIsSending(true);

      try {
        if (editingMessageId) {
          await apiRequest(`/chat/messages/${editingMessageId}`, {
            method: "PATCH",
            ...authOptions(),
            body: { body },
          });
        } else {
          await apiRequest(`/chat/rooms/${roomId}/messages`, {
            method: "POST",
            ...authOptions(),
            body: {
              body,
              replyToMessageId: replyTo?.id,
            },
          });
        }

        pinnedToBottomRef.current = true;
        resetComposeState();

        await loadRooms({ force: true });
        const refreshed = await fetchRoomMessages(roomId, { force: true });
        if (selectedRoomIdRef.current === roomId) {
          setMessages(refreshed);
          setHasLoadedCurrentRoom(true);
          const last = refreshed.at(-1)?.createdAt;
          setRoomReadOptimistic(roomId, last);
          void markRead(roomId, last);
        }
      } catch (requestError) {
        setError(normalizeError(requestError, editingMessageId ? "Не удалось сохранить сообщение" : "Не удалось отправить сообщение"));
      } finally {
        setIsSending(false);
      }
    },
    [
      authOptions,
      draft,
      editingMessageId,
      fetchRoomMessages,
      loadRooms,
      markRead,
      replyTo?.id,
      resetComposeState,
      selectedRoomId,
      setRoomReadOptimistic,
    ]
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!selectedRoomId) return;
      const roomId = selectedRoomId;
      setError(null);
      setIsMutatingMessage(true);

      try {
        await apiRequest(`/chat/messages/${messageId}`, {
          method: "DELETE",
          ...authOptions(),
        });

        if (editingMessageId === messageId) {
          setEditingMessageId(null);
          setDraft("");
        }
        if (replyTo?.id === messageId) {
          setReplyTo(null);
        }

        setActionMessageId(null);
        await loadRooms({ force: true });
        const refreshed = await fetchRoomMessages(roomId, { force: true });
        if (selectedRoomIdRef.current === roomId) {
          setMessages(refreshed);
          setHasLoadedCurrentRoom(true);
          const last = refreshed.at(-1)?.createdAt;
          setRoomReadOptimistic(roomId, last);
          void markRead(roomId, last);
        }
      } catch (requestError) {
        setError(normalizeError(requestError, "Не удалось удалить сообщение"));
      } finally {
        setIsMutatingMessage(false);
      }
    },
    [
      authOptions,
      editingMessageId,
      fetchRoomMessages,
      loadRooms,
      markRead,
      replyTo?.id,
      selectedRoomId,
      setRoomReadOptimistic,
    ]
  );

  const openDirect = useCallback(
    async (userId: number) => {
      setError(null);
      setIsOpeningDirect(true);

      try {
        const response = await apiRequest<DirectRoomResponse>(`/chat/direct/${userId}`, {
          method: "POST",
          ...authOptions(),
          body: {},
        });

        await loadRooms({ force: true });
        if (response.room?.id) {
          prefetchRoomMessages(response.room.id);
          selectRoom(response.room.id);
          setMode("topics");
          setView("chat");
        }
      } catch (requestError) {
        setError(normalizeError(requestError, "Не удалось открыть диалог"));
      } finally {
        setIsOpeningDirect(false);
      }
    },
    [authOptions, loadRooms, prefetchRoomMessages, selectRoom]
  );

  const createTopic = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const name = newTopicName.trim();
      if (!name) return;

      setError(null);
      setIsCreatingTopic(true);
      try {
        await apiRequest("/chat/rooms", {
          method: "POST",
          ...authOptions(),
          body: {
            name,
            isPrivate: false,
          },
        });
        setNewTopicName("");
        await loadRooms({ force: true });
      } catch (requestError) {
        setError(normalizeError(requestError, "Не удалось создать топик"));
      } finally {
        setIsCreatingTopic(false);
      }
    },
    [authOptions, loadRooms, newTopicName]
  );

  const startReply = useCallback(
    (message: ChatMessageVm) => {
      setEditingMessageId(null);
      setReplyTo(message);
      setActionMessageId(null);
      focusDraft();
    },
    [focusDraft]
  );

  const startEdit = useCallback((message: ChatMessageVm) => {
    setReplyTo(null);
    setEditingMessageId(message.id);
    setActionMessageId(null);
  }, []);

  const cancelDraftMode = useCallback(() => {
    setReplyTo(null);
    setEditingMessageId(null);
    setDraft("");
    focusDraft(0);
  }, [focusDraft]);

  const toggleActionMessage = useCallback((messageId: string) => {
    setActionMessageId((current) => (current === messageId ? null : messageId));
  }, []);

  const onMessageLongPressStart = useCallback((messageId: string) => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
    }
    longPressRef.current = setTimeout(() => {
      setActionMessageId((current) => (current === messageId ? null : messageId));
    }, 420);
  }, []);

  const onMessageLongPressEnd = useCallback(() => {
    if (!longPressRef.current) return;
    clearTimeout(longPressRef.current);
    longPressRef.current = null;
  }, []);

  if (!open) return null;

  const title = selectedRoom && showChat ? roomLabel(selectedRoom, session.user.id) : "Сообщения";
  const showMessagesSkeleton = isRoomSwitching && !hasLoadedCurrentRoom;
  const showMessagesOverlay = isRoomSwitching;
  const busyTopicActions = isBootstrapping || isCreatingTopic || isOpeningDirect;
  const editCutoff = Date.now() - EDIT_WINDOW_MS;

  const renderRoomRow = (room: ChatRoomItem, avatar: string, label: string) => (
    <button
      key={room.id}
      type="button"
      className={room.id === selectedRoomId ? "chat-row active" : "chat-row"}
      onPointerDown={() => prefetchRoomMessages(room.id)}
      onTouchStart={() => prefetchRoomMessages(room.id)}
      onClick={() => selectRoom(room.id)}
    >
      <span className="chat-avatar">{avatar}</span>
      <span className="chat-meta">
        <span className="chat-title">{label}</span>
        <span className="chat-sub">{room.lastMessage ? room.lastMessage.body : "Нет сообщений"}</span>
      </span>
      {room.unreadCount > 0 ? <span className="chat-unread">{room.unreadCount > 99 ? "99+" : room.unreadCount}</span> : null}
    </button>
  );

  const chrome = (
    <div
      className={[
        "messenger-drawer",
        isPage ? "is-page is-expanded" : expanded ? "is-widget is-expanded" : "is-widget is-compact",
        compact ? "is-compact" : "",
      ].join(" ")}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <header className="messenger-head">
        <div className="messenger-head-left">
          {compact && view === "chat" ? (
            <button
              type="button"
              className="secondary-button small icon-button"
              onClick={() => setView("list")}
              title="Назад к списку"
              aria-label="Назад к списку"
            >
              <ArrowLeft size={16} />
            </button>
          ) : null}
          {isPage && compact && view === "list" ? (
            <button
              type="button"
              className="secondary-button small icon-button"
              onClick={() => router.push("/dashboard")}
              title="На главную"
              aria-label="На главную"
            >
              <ArrowLeft size={16} />
            </button>
          ) : null}

          <div>
            <p className="messenger-kicker">
              {selectedRoom && showChat ? roomKindLabel(selectedRoom) : mode === "contacts" ? "Контакты" : "Топики и личные"}
            </p>
            <h2 className="messenger-title">{title}</h2>
          </div>
        </div>

        <div className="messenger-actions">
          {!isPage ? (
            <button
              type="button"
              className={compact ? "secondary-button small icon-button" : "secondary-button small"}
              onClick={() => setExpanded((value) => !value)}
              title={expanded ? "Свернуть" : "Развернуть"}
              aria-label={expanded ? "Свернуть" : "Развернуть"}
            >
              {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              {compact ? null : expanded ? "Свернуть" : "Развернуть"}
            </button>
          ) : null}

          {!isPage && onClose ? (
            <button
              type="button"
              className="secondary-button small icon-button"
              onClick={onClose}
              aria-label="Закрыть чат"
              title="Закрыть"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
      </header>

      <div className="messenger-body">
        {showList ? (
          <aside className="messenger-side">
            <div className="messenger-side-top">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={mode === "contacts" ? "Поиск контактов" : "Поиск чатов"}
              />

              <div className="messenger-mode">
                <button
                  type="button"
                  className={mode === "topics" ? "tab-button active" : "tab-button"}
                  onClick={() => setMode("topics")}
                >
                  Топики
                </button>
                <button
                  type="button"
                  className={mode === "contacts" ? "tab-button active" : "tab-button"}
                  onClick={() => setMode("contacts")}
                >
                  Контакты
                </button>
              </div>

              {session.user.role === "CHAIRMAN" && mode === "topics" ? (
                <form className="messenger-create" onSubmit={createTopic}>
                  <input
                    value={newTopicName}
                    onChange={(event) => setNewTopicName(event.target.value)}
                    placeholder="Новый топик (например, Дороги)"
                  />
                  <button type="submit" className="primary-button" disabled={busyTopicActions}>
                    +
                  </button>
                </form>
              ) : null}
            </div>

            {error ? <div className="error">{error}</div> : null}

            <div className="messenger-list">
              {mode === "contacts" ? (
                visibleContacts.length === 0 ? (
                  <p className="muted">Нет контактов.</p>
                ) : (
                  visibleContacts.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      className="chat-row"
                      onClick={() => openDirect(user.id)}
                      disabled={isOpeningDirect}
                    >
                      <span className="chat-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
                      <span className="chat-meta">
                        <span className="chat-title">{user.name}</span>
                        <span className="chat-sub">
                          {user.ownedPlots && user.ownedPlots.length > 0
                            ? `участки: ${user.ownedPlots.map((plot) => `№${plot.number}`).join(", ")}`
                            : "без участка"}
                        </span>
                      </span>
                    </button>
                  ))
                )
              ) : (
                <>
                  <p className="messenger-section">Топики</p>
                  {visibleTopics.length === 0 ? <p className="muted">Топиков пока нет.</p> : null}
                  {visibleTopics.map((room) => renderRoomRow(room, "#", room.name))}

                  <p className="messenger-section">Личные</p>
                  {visibleDirects.length === 0 ? <p className="muted">Личных чатов пока нет.</p> : null}
                  {visibleDirects.map((room) => {
                    const label = roomLabel(room, session.user.id);
                    return renderRoomRow(room, label.slice(0, 1).toUpperCase(), label);
                  })}
                </>
              )}
            </div>
          </aside>
        ) : null}

        {showChat ? (
          <section className="messenger-chat">
            {selectedRoomId ? (
              <>
                <div
                  className={showMessagesOverlay ? "messenger-messages is-loading" : "messenger-messages"}
                  ref={messagesRef}
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget) {
                      setActionMessageId(null);
                    }
                  }}
                  onScroll={() => {
                    const element = messagesRef.current;
                    if (!element) return;
                    const delta = element.scrollHeight - (element.scrollTop + element.clientHeight);
                    pinnedToBottomRef.current = delta < 140;
                  }}
                >
                  {showMessagesSkeleton ? (
                    <div className="messages-skeleton" aria-hidden="true">
                      <span className="messages-skeleton-row other" />
                      <span className="messages-skeleton-row other short" />
                      <span className="messages-skeleton-row mine" />
                      <span className="messages-skeleton-row mine short" />
                    </div>
                  ) : null}

                  {!showMessagesSkeleton && messages.length === 0 ? <p className="muted">Сообщений пока нет.</p> : null}

                  {!showMessagesSkeleton
                    ? messages.map((message, index) => {
                        const previous = messages[index - 1];
                        const mine = message.author.id === session.user.id;
                        const sameAuthor = previous?.author.id === message.author.id;
                        const grouped = Boolean(sameAuthor && previous && message.createdAtMs - previous.createdAtMs < GROUP_WINDOW_MS);
                        const isTopic = Boolean(selectedRoom && !selectedRoom.isPrivate);
                        const showAuthor = isTopic && !mine && !grouped;
                        const showAvatar = isTopic && !mine && !grouped;
                        const needsAvatarSpacer = isTopic && !mine && grouped;
                        const actionOpen = actionMessageId === message.id;
                        const canReply = !message.isDeleted;
                        const canEdit = !message.isDeleted && mine && message.createdAtMs >= editCutoff;
                        const canDelete = !message.isDeleted && (mine || session.user.role === "CHAIRMAN");

                        return (
                          <MessageItem
                            key={message.id}
                            message={message}
                            mine={mine}
                            grouped={grouped}
                            isTopic={isTopic}
                            showAuthor={showAuthor}
                            showAvatar={showAvatar}
                            needsAvatarSpacer={needsAvatarSpacer}
                            showInlineMessageActions={showInlineMessageActions}
                            actionOpen={actionOpen}
                            canReply={canReply}
                            canEdit={canEdit}
                            canDelete={canDelete}
                            onToggleAction={toggleActionMessage}
                            onReply={startReply}
                            onEdit={startEdit}
                            onDelete={deleteMessage}
                            onLongPressStart={onMessageLongPressStart}
                            onLongPressEnd={onMessageLongPressEnd}
                          />
                        );
                      })
                    : null}

                  {showMessagesOverlay ? <div className="messages-loading-overlay">Загрузка…</div> : null}
                </div>

                <form className="messenger-compose" onSubmit={send}>
                  {replyTo || editingMessageId ? (
                    <div className="compose-mode">
                      <p className="compose-mode-title">{editingMessageId ? "Редактирование" : "Ответ"}</p>
                      <p className="compose-mode-body">
                        {editingMessageId ? editingMessage?.body ?? "Сообщение" : `${replyTo?.author.name ?? ""}: ${replyTo?.body ?? ""}`}
                      </p>
                      <button type="button" className="icon-button" onClick={cancelDraftMode} aria-label="Сбросить">
                        <X size={14} />
                      </button>
                    </div>
                  ) : null}

                  <textarea
                    ref={draftRef}
                    value={draft}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      setCursorPosition(event.target.selectionStart ?? event.target.value.length);
                    }}
                    onClick={(event) => setCursorPosition(event.currentTarget.selectionStart ?? draft.length)}
                    onKeyUp={(event) => setCursorPosition(event.currentTarget.selectionStart ?? draft.length)}
                    placeholder="Сообщение"
                    rows={isMobileViewport ? 1 : 2}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                  />

                  {mentionContext && mentionSuggestions.length > 0 ? (
                    <div className="mention-picker">
                      {mentionSuggestions.map((user) => (
                        <button key={user.id} type="button" onClick={() => applyMention(user)}>
                          <span className="mention-name">{user.name}</span>
                          {user.phone ? <span className="mention-phone">{user.phone}</span> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <button className="primary-button" type="submit" disabled={isSending || isMutatingMessage || isRoomSwitching}>
                    {isSending ? "Отправка..." : editingMessageId ? "Сохранить" : "Отправить"}
                  </button>
                </form>
              </>
            ) : (
              <div className="messenger-empty">
                <p className="muted">{isBootstrapping ? "Загружаем список чатов..." : "Выберите чат или откройте контакт."}</p>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );

  if (isPage) {
    return <div className="messenger-page">{chrome}</div>;
  }

  return (
    <div
      className="messenger-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && onClose) {
          onClose();
        }
      }}
    >
      {chrome}
    </div>
  );
}
