"use client";

import { FormEvent, useEffect, useState } from "react";
import { PortalShell } from "@/components/portal-shell";
import { Panel } from "@/components/ui-kit";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

interface Meeting {
  id: string;
  title: string;
  status: string;
  scheduledAt: string;
}

interface Vote {
  id: string;
  title: string;
  status: "DRAFT" | "OPEN" | "CLOSED";
  opensAt: string;
  closesAt: string;
}

interface MeetingsResponse {
  items: Meeting[];
}

interface VotesResponse {
  items: Vote[];
}

export default function GovernancePage() {
  const { ready, session } = useAuth(true);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);

  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");

  const [selectedMeetingId, setSelectedMeetingId] = useState("");
  const [voteTitle, setVoteTitle] = useState("");
  const [voteOpenAt, setVoteOpenAt] = useState("");
  const [voteCloseAt, setVoteCloseAt] = useState("");

  const load = async () => {
    if (!session) return;

    const [meetingsData, votesData] = await Promise.all([
      apiRequest<MeetingsResponse>("/meetings", {
        token: session.accessToken,
        tenantSlug: session.tenantSlug,
      }),
      apiRequest<VotesResponse>("/votes", {
        token: session.accessToken,
        tenantSlug: session.tenantSlug,
      }),
    ]);

    setMeetings(meetingsData.items);
    setVotes(votesData.items);

    if (!selectedMeetingId && meetingsData.items.length > 0) {
      setSelectedMeetingId(meetingsData.items[0].id);
    }
  };

  useEffect(() => {
    if (!ready || !session) return;
    load().catch(() => {
      setMeetings([]);
      setVotes([]);
    });
  }, [ready, session]);

  const createMeeting = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || session.user.role !== "CHAIRMAN") return;

    await apiRequest("/meetings", {
      method: "POST",
      token: session.accessToken,
      tenantSlug: session.tenantSlug,
      body: {
        title: meetingTitle,
        scheduledAt: new Date(meetingDate).toISOString(),
      },
    });

    setMeetingTitle("");
    setMeetingDate("");
    await load();
  };

  const publishMeeting = async (meetingId: string) => {
    if (!session || session.user.role !== "CHAIRMAN") return;

    await apiRequest(`/meetings/${meetingId}/publish`, {
      method: "PATCH",
      token: session.accessToken,
      tenantSlug: session.tenantSlug,
    });

    await load();
  };

  const createVote = async (event: FormEvent) => {
    event.preventDefault();
    if (!session || session.user.role !== "CHAIRMAN") return;

    await apiRequest("/votes", {
      method: "POST",
      token: session.accessToken,
      tenantSlug: session.tenantSlug,
      body: {
        meetingId: selectedMeetingId,
        title: voteTitle,
        opensAt: new Date(voteOpenAt).toISOString(),
        closesAt: new Date(voteCloseAt).toISOString(),
      },
    });

    setVoteTitle("");
    setVoteOpenAt("");
    setVoteCloseAt("");
    await load();
  };

  const castVote = async (voteId: string, choice: "YES" | "NO" | "ABSTAIN") => {
    if (!session) return;

    await apiRequest(`/votes/${voteId}/ballots`, {
      method: "POST",
      token: session.accessToken,
      tenantSlug: session.tenantSlug,
      body: {
        choice,
      },
    });

    await load();
  };

  if (!ready || !session) {
    return <div className="center-screen">Загрузка...</div>;
  }

  return (
    <PortalShell title="Собрания и голосования" subtitle="Governance и прозрачность решений">
      <div className="grid-2">
        <Panel title="Собрания">
          {session.user.role === "CHAIRMAN" ? (
            <form className="inline-form" onSubmit={createMeeting}>
              <input
                placeholder="Тема собрания"
                value={meetingTitle}
                onChange={(event) => setMeetingTitle(event.target.value)}
              />
              <input
                type="datetime-local"
                value={meetingDate}
                onChange={(event) => setMeetingDate(event.target.value)}
              />
              <button className="primary-button" type="submit">
                Создать собрание
              </button>
            </form>
          ) : null}

          <ul>
            {meetings.map((meeting) => (
              <li key={meeting.id}>
                {meeting.title} · {meeting.status} · {new Date(meeting.scheduledAt).toLocaleString("ru-RU")}
                {session.user.role === "CHAIRMAN" && meeting.status === "DRAFT" ? (
                  <>
                    <br />
                    <button className="secondary-button" onClick={() => publishMeeting(meeting.id)}>
                      Опубликовать
                    </button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Голосования">
          {session.user.role === "CHAIRMAN" ? (
            <form className="inline-form" onSubmit={createVote}>
              <select
                value={selectedMeetingId}
                onChange={(event) => setSelectedMeetingId(event.target.value)}
              >
                {meetings.map((meeting) => (
                  <option key={meeting.id} value={meeting.id}>
                    {meeting.title}
                  </option>
                ))}
              </select>
              <input
                placeholder="Вопрос голосования"
                value={voteTitle}
                onChange={(event) => setVoteTitle(event.target.value)}
              />
              <input
                type="datetime-local"
                value={voteOpenAt}
                onChange={(event) => setVoteOpenAt(event.target.value)}
              />
              <input
                type="datetime-local"
                value={voteCloseAt}
                onChange={(event) => setVoteCloseAt(event.target.value)}
              />
              <button className="primary-button" type="submit">
                Создать голосование
              </button>
            </form>
          ) : null}

          <ul>
            {votes.map((vote) => (
              <li key={vote.id}>
                <strong>{vote.title}</strong> · {vote.status}
                {vote.status === "OPEN" ? (
                  <>
                    <br />
                    <button className="secondary-button" onClick={() => castVote(vote.id, "YES")}>За</button>
                    {" "}
                    <button className="secondary-button" onClick={() => castVote(vote.id, "NO")}>Против</button>
                    {" "}
                    <button className="secondary-button" onClick={() => castVote(vote.id, "ABSTAIN")}>Воздержался</button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </PortalShell>
  );
}
