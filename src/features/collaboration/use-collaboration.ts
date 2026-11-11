"use client";

import { HocuspocusProvider } from "@hocuspocus/provider";
import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";

import { getCollabWsUrl } from "@/features/collaboration/env";
import {
  colorForUserId,
  type CollaborationConnectionStatus,
  type PresenceUser,
} from "@/features/collaboration/types";
import { createClient } from "@/lib/supabase/client";

type UseCollaborationOptions = {
  documentId: string;
  userId: string;
  userName: string;
  userEmail: string;
  enabled: boolean;
};

type UseCollaborationResult = {
  ydoc: Y.Doc | null;
  provider: HocuspocusProvider | null;
  status: CollaborationConnectionStatus;
  synced: boolean;
  errorMessage: string | null;
  presenceUsers: PresenceUser[];
  activeCount: number;
};

async function resolveAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getSession();
  if (!error && data.session?.access_token) {
    return data.session.access_token;
  }

  const refreshed = await supabase.auth.refreshSession();
  if (refreshed.error || !refreshed.data.session?.access_token) {
    return null;
  }
  return refreshed.data.session.access_token;
}

function collectPresence(
  awareness: NonNullable<HocuspocusProvider["awareness"]>,
): PresenceUser[] {
  const users: PresenceUser[] = [];
  awareness.getStates().forEach((state, clientId) => {
    const user = state.user as
      | {
          id?: string;
          name?: string;
          email?: string;
          color?: string;
        }
      | undefined;
    if (!user?.id || !user.name) {
      return;
    }
    users.push({
      clientId,
      userId: user.id,
      name: user.name,
      email: user.email ?? "",
      color: user.color ?? colorForUserId(user.id),
    });
  });

  const byUser = new Map<string, PresenceUser>();
  for (const user of users) {
    const existing = byUser.get(user.userId);
    if (!existing || user.clientId < existing.clientId) {
      byUser.set(user.userId, user);
    }
  }
  return Array.from(byUser.values());
}

export function useCollaboration({
  documentId,
  userId,
  userName,
  userEmail,
  enabled,
}: UseCollaborationOptions): UseCollaborationResult {
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const [status, setStatus] =
    useState<CollaborationConnectionStatus>("connecting");
  const [synced, setSynced] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);

  const identityRef = useRef({ userId, userName, userEmail });
  identityRef.current = { userId, userName, userEmail };

  useEffect(() => {
    if (!enabled) {
      setYdoc(null);
      setProvider(null);
      setSynced(false);
      setStatus("disconnected");
      setPresenceUsers([]);
      return;
    }

    const wsUrl = getCollabWsUrl();
    if (!wsUrl) {
      setStatus("error");
      setErrorMessage("Collaboration server URL is not configured.");
      return;
    }

    let cancelled = false;
    let awarenessCleanup: (() => void) | null = null;
    const doc = new Y.Doc();
    let activeProvider: HocuspocusProvider | null = null;

    setStatus("connecting");
    setSynced(false);
    setErrorMessage(null);

    void (async () => {
      const initialToken = await resolveAccessToken();
      if (cancelled) {
        doc.destroy();
        return;
      }

      if (!initialToken) {
        setStatus("error");
        setErrorMessage("Unable to authenticate collaboration session.");
        doc.destroy();
        return;
      }

      const nextProvider = new HocuspocusProvider({
        url: wsUrl,
        name: documentId,
        document: doc,
        token: async () => {
          const refreshed = await resolveAccessToken();
          if (!refreshed) {
            throw new Error("Missing collaboration token");
          }
          return refreshed;
        },
        onAuthenticationFailed: () => {
          if (cancelled) {
            return;
          }
          setSynced(false);
          setStatus("error");
          setErrorMessage(
            "Collaboration authentication failed. Sign out and sign in again.",
          );
        },
        onConnect: () => {
          if (cancelled) {
            return;
          }
          setStatus("connected");
          setErrorMessage(null);
        },
        onClose: () => {
          if (cancelled) {
            return;
          }
          setSynced(false);
          setStatus((current) =>
            current === "error" ? current : "disconnected",
          );
        },
        onDisconnect: () => {
          if (cancelled) {
            return;
          }
          setSynced(false);
          setStatus((current) =>
            current === "error" ? current : "reconnecting",
          );
        },
        onStatus: ({ status: providerStatus }) => {
          if (cancelled) {
            return;
          }
          if (providerStatus === "connecting") {
            setSynced(false);
            setStatus((current) =>
              current === "connected" || current === "reconnecting"
                ? "reconnecting"
                : "connecting",
            );
          } else if (providerStatus === "connected") {
            setStatus("connected");
            setErrorMessage(null);
          } else if (providerStatus === "disconnected") {
            setSynced(false);
            setStatus((current) =>
              current === "error" ? current : "disconnected",
            );
          }
        },
        onSynced: ({ state }) => {
          if (cancelled) {
            return;
          }
          setSynced(Boolean(state));
          if (state) {
            setStatus("connected");
            setErrorMessage(null);
          }
        },
      });

      if (cancelled) {
        nextProvider.destroy();
        doc.destroy();
        return;
      }

      activeProvider = nextProvider;

      const awareness = nextProvider.awareness;
      if (awareness) {
        const identity = identityRef.current;
        awareness.setLocalStateField("user", {
          id: identity.userId,
          name: identity.userName,
          email: identity.userEmail,
          color: colorForUserId(identity.userId),
        });

        const syncPresence = () => {
          if (cancelled || !awareness) {
            return;
          }
          setPresenceUsers(collectPresence(awareness));
        };

        awareness.on("change", syncPresence);
        syncPresence();
        awarenessCleanup = () => {
          awareness.off("change", syncPresence);
        };
      }

      // Expose doc + provider together only after provider construction so the
      // editor never binds to an orphaned Y.Doc.
      setYdoc(doc);
      setProvider(nextProvider);

      if (nextProvider.isSynced) {
        setSynced(true);
        setStatus("connected");
      }
    })();

    return () => {
      cancelled = true;
      awarenessCleanup?.();
      if (activeProvider) {
        activeProvider.awareness?.setLocalState(null);
        activeProvider.destroy();
      }
      doc.destroy();
      setProvider(null);
      setYdoc(null);
      setSynced(false);
      setPresenceUsers([]);
    };
    // Identity fields are applied via ref so renaming display name does not
    // tear down the WebSocket / Yjs session mid-edit.
  }, [documentId, enabled]);

  return {
    ydoc,
    provider,
    status,
    synced,
    errorMessage,
    presenceUsers,
    activeCount: presenceUsers.length,
  };
}
