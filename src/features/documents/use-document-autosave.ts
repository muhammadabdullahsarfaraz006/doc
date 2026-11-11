"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { saveDocumentContent } from "@/features/documents/actions";
import {
  serializeTipTapDocument,
  type TipTapDocument,
} from "@/lib/validation/tiptap";

export type SaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "error"
  | "conflict";

type UseDocumentAutosaveOptions = {
  documentId: string;
  initialRevision: number;
  initialContent: TipTapDocument;
  canEdit: boolean;
  debounceMs?: number;
};

export function useDocumentAutosave({
  documentId,
  initialRevision,
  initialContent,
  canEdit,
  debounceMs = 900,
}: UseDocumentAutosaveOptions) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [revision, setRevision] = useState(initialRevision);

  const revisionRef = useRef(initialRevision);
  const latestContentRef = useRef<TipTapDocument>(initialContent);
  const lastSavedSerializedRef = useRef(serializeTipTapDocument(initialContent));
  const savingRef = useRef(false);
  const pendingAfterSaveRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const canEditRef = useRef(canEdit);
  const documentIdRef = useRef(documentId);

  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);

  useEffect(() => {
    documentIdRef.current = documentId;
  }, [documentId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    revisionRef.current = initialRevision;
    setRevision(initialRevision);
  }, [initialRevision]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flushSaveRef = useRef<() => Promise<void>>(async () => undefined);

  flushSaveRef.current = async () => {
    if (!canEditRef.current) {
      return;
    }

    const content = latestContentRef.current;
    const serialized = serializeTipTapDocument(content);

    if (serialized === lastSavedSerializedRef.current) {
      if (mountedRef.current) {
        setStatus((current) => (current === "dirty" ? "saved" : current));
        setErrorMessage(null);
      }
      return;
    }

    if (savingRef.current) {
      pendingAfterSaveRef.current = true;
      return;
    }

    savingRef.current = true;
    pendingAfterSaveRef.current = false;
    const expectedRevision = revisionRef.current;

    if (mountedRef.current) {
      setStatus("saving");
      setErrorMessage(null);
    }

    const result = await saveDocumentContent({
      documentId: documentIdRef.current,
      content,
      expectedRevision,
    });

    savingRef.current = false;

    if (!mountedRef.current) {
      pendingAfterSaveRef.current = false;
      return;
    }

    if (result.ok) {
      if (revisionRef.current === expectedRevision) {
        revisionRef.current = result.revision;
        setRevision(result.revision);
        lastSavedSerializedRef.current = serializeTipTapDocument(content);

        const latestSerialized = serializeTipTapDocument(
          latestContentRef.current,
        );
        if (latestSerialized !== lastSavedSerializedRef.current) {
          pendingAfterSaveRef.current = true;
          setStatus("dirty");
        } else {
          setStatus("saved");
          setErrorMessage(null);
        }
      } else {
        pendingAfterSaveRef.current = true;
        setStatus("dirty");
      }
    } else {
      setStatus(result.code === "conflict" ? "conflict" : "error");
      setErrorMessage(result.message);
    }

    if (pendingAfterSaveRef.current) {
      pendingAfterSaveRef.current = false;
      await flushSaveRef.current();
    }
  };

  const queueSave = useCallback(
    (content: TipTapDocument) => {
      if (!canEditRef.current) {
        return;
      }

      latestContentRef.current = content;
      const serialized = serializeTipTapDocument(content);

      if (serialized === lastSavedSerializedRef.current) {
        clearTimer();
        setStatus((current) =>
          current === "saving" || current === "conflict" || current === "error"
            ? current
            : "saved",
        );
        return;
      }

      setStatus("dirty");
      setErrorMessage(null);
      clearTimer();
      timerRef.current = setTimeout(() => {
        void flushSaveRef.current();
      }, debounceMs);
    },
    [clearTimer, debounceMs],
  );

  const retry = useCallback(() => {
    clearTimer();
    void flushSaveRef.current();
  }, [clearTimer]);

  const syncRevisionFromRename = useCallback((nextRevision: number) => {
    revisionRef.current = nextRevision;
    setRevision(nextRevision);
    if (mountedRef.current) {
      setStatus((current) =>
        current === "dirty" || current === "saving" ? current : "saved",
      );
    }
  }, []);

  const flushNow = useCallback(() => {
    clearTimer();
    void flushSaveRef.current();
  }, [clearTimer]);

  return {
    status,
    errorMessage,
    revision,
    queueSave,
    retry,
    flushNow,
    syncRevisionFromRename,
  };
}
