"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { loadSession, SessionState } from "@/lib/session";
import { ArrowLeft, CornerUpLeft, Maximize2, Minimize2, Pencil, Trash2, X } from "lucide-react";

type RoomId = string;

const EDIT_WINDOW_MS = 15 * 60 * 1000;

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

const normalizeError = (error: unknown, fallback: string) => {
  if (!(error instanceof ApiRequestError)) return fallback;
  return error.message;
};

const roomLabel = (room: ChatRoomItem | null, myUserId: number) => {
  if (!room) return "";
  if (!room.isPrivate) return room.name;
  const other = room.members.map((m) => m.user).find((u) => u.id !== myUserId);
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newTopicName, setNewTopicName] = useState("");
  const [expanded, setExpanded] = useState(isPage);
  const [view, setView] = useState<"list" | "chat">("list");
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [actionMessageId, setActionMessageId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [cursorPosition, setCursorPosition] = useState(0);

  const messagesRef = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const pinnedToBottomRef = useRef(true);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const compact = (!isPage && !expanded) || (isPage && isMobileViewport);
  const showList = !compact || view === "list";
  const showChat = !compact || view === "chat";
  const showInlineMessageActions = !isMobileViewport;

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

  const authOptions = useCallback(() => {
    const latest = loadSession();
    return {
      token: latest?.accessToken ?? session.accessToken,
      tenantSlug: latest?.tenantSlug ?? session.tenantSlug,
    };
  }, [session.accessToken, session.tenantSlug]);

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId) ?? null,
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

    return {
      query,
      start,
      end: safeCursor,
    };
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
    if (!term) {
      return rooms;
    }

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
    return contacts.filter((c) => c.name.toLowerCase().includes(term));
  }, [contacts, search]);

  const resetComposeState = useCallback(() => {
    setDraft("");
    setReplyTo(null);
    setEditingMessageId(null);
    setActionMessageId(null);
    setCursorPosition(0);
  }, []);

  const loadRooms = useCallback(async () => {
    const response = await apiRequest<RoomsResponse>("/chat/rooms", {
      ...authOptions(),
    });
    setRooms(response.items);

    setSelectedRoomId((current) => {
      if (current && response.items.some((room) => room.id === current)) {
        return current;
      }
      return response.items[0]?.id ?? null;
    });
  }, [authOptions]);

  const loadContacts = useCallback(async () => {
    const response = await apiRequest<ContactListResponse>("/chat/contacts", {
      ...authOptions(),
    });
    setContacts(response.items);
  }, [authOptions]);

  const loadMessages = useCallback(
    async (roomId: string) => {
      const response = await apiRequest<RoomMessagesResponse>(`/chat/rooms/${roomId}/messages`, {
        ...authOptions(),
      });
      setMessages(response.items);
      return response.items;
    },
    [authOptions]
  );

  const markRead = useCallback(
    async (roomId: string, readAt: string | undefined) => {
      try {
        await apiRequest(`/chat/rooms/${roomId}/read`, {
          method: "POST",
          ...authOptions(),
          body: readAt ? { readAt } : {},
        });

        setRooms((prev) =>
          prev.map((room) =>
            room.id === roomId
              ? {
                  ...room,
                  unreadCount: 0,
                  lastReadAt: readAt ?? new Date().toISOString(),
                }
              : room
          )
        );

        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("snt:chat-summary-invalidated"));
        }
      } catch (_error) {
        // Non-critical.
      }
    },
    [authOptions]
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

  useEffect(() => {
    if (!open) return;

    setError(null);
    setLoading(true);
    Promise.all([loadRooms(), loadContacts()])
      .catch((err) => setError(normalizeError(err, "Не удалось загрузить чат")))
      .finally(() => setLoading(false));
  }, [open, loadRooms, loadContacts]);

  useEffect(() => {
    if (!open) return;
    if (!selectedRoomId) return;

    resetComposeState();
    pinnedToBottomRef.current = true;
    setError(null);
    setLoading(true);
    loadMessages(selectedRoomId)
      .then((items) => {
        const last = items.at(-1)?.createdAt;
        return markRead(selectedRoomId, last);
      })
      .catch((err) => setError(normalizeError(err, "Не удалось загрузить сообщения")))
      .finally(() => setLoading(false));
  }, [open, selectedRoomId, loadMessages, markRead, resetComposeState]);

  useEffect(() => {
    if (!open) return;
    if (!showChat) return;

    const el = messagesRef.current;
    if (!el) return;

    if (pinnedToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, open, showChat]);

  useEffect(() => {
    if (!editingMessage) return;
    setDraft(editingMessage.body);
    focusDraft(editingMessage.body.length);
  }, [editingMessage, focusDraft]);

  const applyMention = (user: ChatUser) => {
    if (!mentionContext) return;

    const alias = mentionAlias(user);
    const token = `@${alias}`;
    const nextDraft = `${draft.slice(0, mentionContext.start)}${token} ${draft.slice(mentionContext.end)}`;
    const nextCursor = mentionContext.start + token.length + 1;

    setDraft(nextDraft);
    window.requestAnimationFrame(() => focusDraft(nextCursor));
  };

  const send = async (event?: FormEvent) => {
    if (event) event.preventDefault();
    if (!selectedRoomId) return;

    const body = draft.trim();
    if (!body) return;

    setError(null);
    setLoading(true);

    try {
      if (editingMessageId) {
        await apiRequest(`/chat/messages/${editingMessageId}`, {
          method: "PATCH",
          ...authOptions(),
          body: {
            body,
          },
        });
      } else {
        await apiRequest(`/chat/rooms/${selectedRoomId}/messages`, {
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
      await Promise.all([loadRooms(), loadMessages(selectedRoomId)]);
    } catch (err) {
      setError(normalizeError(err, editingMessageId ? "Не удалось сохранить сообщение" : "Не удалось отправить сообщение"));
    } finally {
      setLoading(false);
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!selectedRoomId) return;

    setError(null);
    setLoading(true);
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
      await Promise.all([loadRooms(), loadMessages(selectedRoomId)]);
    } catch (err) {
      setError(normalizeError(err, "Не удалось удалить сообщение"));
    } finally {
      setLoading(false);
    }
  };

  const openDirect = async (userId: number) => {
    setError(null);
    setLoading(true);

    try {
      const response = await apiRequest<DirectRoomResponse>(`/chat/direct/${userId}`, {
        method: "POST",
        ...authOptions(),
        body: {},
      });

      await loadRooms();

      if (response.room?.id) {
        setSelectedRoomId(response.room.id);
        setMode("topics");
        setView("chat");
      }
    } catch (err) {
      setError(normalizeError(err, "Не удалось открыть диалог"));
    } finally {
      setLoading(false);
    }
  };

  const createTopic = async (event: FormEvent) => {
    event.preventDefault();
    const name = newTopicName.trim();
    if (!name) return;

    setError(null);
    setLoading(true);
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
      await loadRooms();
    } catch (err) {
      setError(normalizeError(err, "Не удалось создать топик"));
    } finally {
      setLoading(false);
    }
  };

  const startReply = (message: ChatMessage) => {
    setEditingMessageId(null);
    setReplyTo(message);
    setActionMessageId(null);
    focusDraft();
  };

  const startEdit = (message: ChatMessage) => {
    setReplyTo(null);
    setEditingMessageId(message.id);
    setActionMessageId(null);
  };

  const cancelDraftMode = () => {
    setReplyTo(null);
    setEditingMessageId(null);
    setDraft("");
    focusDraft(0);
  };

  const onMessageLongPressStart = (messageId: string) => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
    }

    longPressRef.current = setTimeout(() => {
      setActionMessageId((current) => (current === messageId ? null : messageId));
    }, 420);
  };

  const onMessageLongPressEnd = () => {
    if (!longPressRef.current) return;
    clearTimeout(longPressRef.current);
    longPressRef.current = null;
  };

  if (!open) return null;

  const title = selectedRoom && showChat ? roomLabel(selectedRoom, session.user.id) : "Сообщения";

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
                  <button type="submit" className="primary-button" disabled={loading}>
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
                      disabled={loading}
                    >
                      <span className="chat-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
                      <span className="chat-meta">
                        <span className="chat-title">{user.name}</span>
                        <span className="chat-sub">
                          {user.ownedPlots && user.ownedPlots.length > 0
                            ? `участки: ${user.ownedPlots.map((p) => `№${p.number}`).join(", ")}`
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
                  {visibleTopics.map((room) => (
                    <button
                      key={room.id}
                      type="button"
                      className={room.id === selectedRoomId ? "chat-row active" : "chat-row"}
                      onClick={() => {
                        setSelectedRoomId(room.id);
                        if (compact) setView("chat");
                      }}
                    >
                      <span className="chat-avatar">#</span>
                      <span className="chat-meta">
                        <span className="chat-title">{room.name}</span>
                        <span className="chat-sub">{room.lastMessage ? room.lastMessage.body : "Нет сообщений"}</span>
                      </span>
                      {room.unreadCount > 0 ? (
                        <span className="chat-unread">{room.unreadCount > 99 ? "99+" : room.unreadCount}</span>
                      ) : null}
                    </button>
                  ))}

                  <p className="messenger-section">Личные</p>
                  {visibleDirects.length === 0 ? <p className="muted">Личных чатов пока нет.</p> : null}
                  {visibleDirects.map((room) => (
                    <button
                      key={room.id}
                      type="button"
                      className={room.id === selectedRoomId ? "chat-row active" : "chat-row"}
                      onClick={() => {
                        setSelectedRoomId(room.id);
                        if (compact) setView("chat");
                      }}
                    >
                      <span className="chat-avatar">{roomLabel(room, session.user.id).slice(0, 1).toUpperCase()}</span>
                      <span className="chat-meta">
                        <span className="chat-title">{roomLabel(room, session.user.id)}</span>
                        <span className="chat-sub">{room.lastMessage ? room.lastMessage.body : "Нет сообщений"}</span>
                      </span>
                      {room.unreadCount > 0 ? (
                        <span className="chat-unread">{room.unreadCount > 99 ? "99+" : room.unreadCount}</span>
                      ) : null}
                    </button>
                  ))}
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
                  className="messenger-messages"
                  ref={messagesRef}
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget) {
                      setActionMessageId(null);
                    }
                  }}
                  onScroll={() => {
                    const el = messagesRef.current;
                    if (!el) return;
                    const delta = el.scrollHeight - (el.scrollTop + el.clientHeight);
                    pinnedToBottomRef.current = delta < 140;
                  }}
                >
                  {messages.length === 0 ? <p className="muted">Сообщений пока нет.</p> : null}
                  {messages.map((message, index) => {
                    const prev = messages[index - 1];
                    const mine = message.author.id === session.user.id;
                    const sameAuthor = prev?.author.id === message.author.id;
                    const withinWindow =
                      prev &&
                      new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() <
                        3 * 60 * 1000;
                    const grouped = Boolean(sameAuthor && withinWindow);
                    const isTopic = Boolean(selectedRoom && !selectedRoom.isPrivate);
                    const showAuthor = isTopic && !mine && !grouped;
                    const showAvatar = isTopic && !mine && !grouped;
                    const needsAvatarSpacer = isTopic && !mine && grouped;
                    const timeShort = new Date(message.createdAt).toLocaleTimeString("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    const timeFull = new Date(message.createdAt).toLocaleString("ru-RU");
                    const actionOpen = actionMessageId === message.id;
                    const canReply = !message.isDeleted;
                    const canEdit =
                      !message.isDeleted &&
                      mine &&
                      Date.now() - new Date(message.createdAt).getTime() <= EDIT_WINDOW_MS;
                    const canDelete = !message.isDeleted && (mine || session.user.role === "CHAIRMAN");

                    const bubbleBody = (
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
                          <p className="msg-time" title={timeFull}>
                            {timeShort}
                            {message.isEdited ? " · изм." : ""}
                          </p>
                          {showInlineMessageActions && (canReply || canEdit || canDelete) && !message.isDeleted ? (
                            <button
                              type="button"
                              className="msg-more"
                              onClick={() => setActionMessageId((current) => (current === message.id ? null : message.id))}
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
                              <button type="button" onClick={() => startReply(message)}>
                                <CornerUpLeft size={14} /> Ответить
                              </button>
                            ) : null}
                            {canEdit ? (
                              <button type="button" onClick={() => startEdit(message)}>
                                <Pencil size={14} /> Редактировать
                              </button>
                            ) : null}
                            {canDelete ? (
                              <button type="button" onClick={() => deleteMessage(message.id)}>
                                <Trash2 size={14} /> Удалить
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    );

                    return (
                      <div
                        key={message.id}
                        className={["msg-row", mine ? "mine" : "", grouped ? "grouped" : ""]
                          .filter(Boolean)
                          .join(" ")}
                        onTouchStart={() => onMessageLongPressStart(message.id)}
                        onTouchEnd={onMessageLongPressEnd}
                        onTouchMove={onMessageLongPressEnd}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setActionMessageId((current) => (current === message.id ? null : message.id));
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

                            <div
                              className={["msg-bubble", grouped ? "grouped" : ""].filter(Boolean).join(" ")}
                            >
                              {bubbleBody}
                            </div>
                          </div>
                        ) : (
                          <div
                            className={["msg-bubble", mine ? "mine" : "", grouped ? "grouped" : ""]
                              .filter(Boolean)
                              .join(" ")}
                          >
                            {bubbleBody}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <form className="messenger-compose" onSubmit={send}>
                  {replyTo || editingMessageId ? (
                    <div className="compose-mode">
                      <p className="compose-mode-title">{editingMessageId ? "Редактирование" : "Ответ"}</p>
                      <p className="compose-mode-body">
                        {editingMessageId
                          ? editingMessage?.body ?? "Сообщение"
                          : `${replyTo?.author.name ?? ""}: ${replyTo?.body ?? ""}`}
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
                    rows={2}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        send();
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

                  <button className="primary-button" type="submit" disabled={loading}>
                    {editingMessageId ? "Сохранить" : "Отправить"}
                  </button>
                </form>
              </>
            ) : (
              <div className="messenger-empty">
                <p className="muted">Выберите чат или откройте контакт.</p>
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
