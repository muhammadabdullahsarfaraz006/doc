"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  listCommentRepliesAction,
  listCommentThreadsAction,
  listSuggestionsAction,
} from "@/features/comments/actions";
import type {
  CommentReply,
  CommentThread,
  DocumentSuggestion,
} from "@/features/comments/types";
import { createClient } from "@/lib/supabase/client";

export function useDocumentComments(documentId: string, enabled: boolean) {
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [repliesByThread, setRepliesByThread] = useState<
    Record<string, CommentReply[]>
  >({});
  const [suggestions, setSuggestions] = useState<DocumentSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      return;
    }

    const [threadsResult, suggestionsResult] = await Promise.all([
      listCommentThreadsAction(documentId),
      listSuggestionsAction(documentId),
    ]);

    if (!threadsResult.ok) {
      setError(threadsResult.message);
      setLoading(false);
      return;
    }
    if (!suggestionsResult.ok) {
      setError(suggestionsResult.message);
      setLoading(false);
      return;
    }

    setThreads(threadsResult.data);
    setSuggestions(suggestionsResult.data);
    setError(null);

    const replyEntries = await Promise.all(
      threadsResult.data.map(async (thread) => {
        const result = await listCommentRepliesAction(thread.id);
        return [thread.id, result.ok ? result.data : []] as const;
      }),
    );

    const next: Record<string, CommentReply[]> = {};
    for (const [threadId, replies] of replyEntries) {
      next[threadId] = replies;
    }
    setRepliesByThread(next);
    setLoading(false);
  }, [documentId, enabled]);

  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) {
      clearTimeout(reloadTimer.current);
    }
    reloadTimer.current = setTimeout(() => {
      void load();
    }, 250);
  }, [load]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void load();
  }, [enabled, load]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const supabase = createClient();
    const channel = supabase
      .channel(`document-comments:${documentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comment_threads",
          filter: `document_id=eq.${documentId}`,
        },
        () => scheduleReload(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "document_suggestions",
          filter: `document_id=eq.${documentId}`,
        },
        () => scheduleReload(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comment_replies",
        },
        () => scheduleReload(),
      )
      .subscribe();

    return () => {
      if (reloadTimer.current) {
        clearTimeout(reloadTimer.current);
      }
      void supabase.removeChannel(channel);
    };
  }, [documentId, enabled, scheduleReload]);

  return {
    threads,
    repliesByThread,
    suggestions,
    loading,
    error,
    reload: load,
  };
}
