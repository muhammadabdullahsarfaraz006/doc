import { describe, expect, it, vi } from "vitest";

/**
 * Pure helper mirroring the autosave queue rules used by useDocumentAutosave.
 * Kept framework-free so debounce / in-flight / pending behavior is unit-tested.
 */
function createAutosaveQueue(options: {
  debounceMs: number;
  save: (content: string, expectedRevision: number) => Promise<
    | { ok: true; revision: number }
    | { ok: false; code: "conflict" | "error" }
  >;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => { cancel: () => void };
}) {
  let revision = 1;
  let latest = "";
  let lastSaved = "";
  let status: "idle" | "dirty" | "saving" | "saved" | "conflict" | "error" =
    "idle";
  let saving = false;
  let pending = false;
  let timer: { cancel: () => void } | null = null;

  const schedule =
    options.schedule ??
    ((fn, ms) => {
      const id = setTimeout(fn, ms);
      return { cancel: () => clearTimeout(id) };
    });

  async function flush() {
    if (latest === lastSaved) {
      status = "saved";
      return;
    }
    if (saving) {
      pending = true;
      return;
    }
    saving = true;
    status = "saving";
    const expected = revision;
    const content = latest;
    const result = await options.save(content, expected);
    saving = false;
    if (result.ok) {
      revision = result.revision;
      lastSaved = content;
      status = latest === lastSaved ? "saved" : "dirty";
    } else {
      status = result.code === "conflict" ? "conflict" : "error";
    }
    if (pending) {
      pending = false;
      await flush();
    }
  }

  return {
    getStatus: () => status,
    getRevision: () => revision,
    queue(content: string) {
      latest = content;
      if (content === lastSaved) {
        timer?.cancel();
        status = "saved";
        return;
      }
      status = "dirty";
      timer?.cancel();
      timer = schedule(() => {
        void flush();
      }, options.debounceMs);
    },
    async flushNow() {
      timer?.cancel();
      await flush();
    },
  };
}

describe("autosave queue behavior", () => {
  it("debounces rapid edits into a single save", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async (_content: string, expectedRevision: number) => ({
      ok: true as const,
      revision: expectedRevision + 1,
    }));
    const queue = createAutosaveQueue({ debounceMs: 900, save });

    queue.queue("a");
    queue.queue("ab");
    queue.queue("abc");
    expect(save).not.toHaveBeenCalled();
    expect(queue.getStatus()).toBe("dirty");

    await vi.advanceTimersByTimeAsync(900);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith("abc", 1);
    expect(queue.getStatus()).toBe("saved");
    expect(queue.getRevision()).toBe(2);
    vi.useRealTimers();
  });

  it("queues a follow-up save when content changes during an in-flight save", async () => {
    const resolvers: Array<(value: { ok: true; revision: number }) => void> =
      [];
    const save = vi.fn((content: string, expectedRevision: number) => {
      void content;
      return new Promise<{ ok: true; revision: number }>((resolve) => {
        resolvers.push((value) => resolve(value));
        void expectedRevision;
      });
    });

    const queue = createAutosaveQueue({
      debounceMs: 0,
      save,
      schedule: (fn) => {
        fn();
        return { cancel: () => undefined };
      },
    });

    queue.queue("one");
    await Promise.resolve();
    expect(queue.getStatus()).toBe("saving");

    queue.queue("two");
    resolvers[0]?.({ ok: true, revision: 2 });
    await Promise.resolve();
    await Promise.resolve();
    resolvers[1]?.({ ok: true, revision: 3 });
    await Promise.resolve();
    await Promise.resolve();

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenNthCalledWith(1, "one", 1);
    expect(save).toHaveBeenNthCalledWith(2, "two", 2);
    expect(queue.getRevision()).toBe(3);
    expect(queue.getStatus()).toBe("saved");
  });

  it("does not mark saved on revision conflict", async () => {
    const queue = createAutosaveQueue({
      debounceMs: 0,
      save: async () => ({ ok: false, code: "conflict" }),
      schedule: (fn) => {
        fn();
        return { cancel: () => undefined };
      },
    });

    queue.queue("local edits");
    await Promise.resolve();
    expect(queue.getStatus()).toBe("conflict");
    expect(queue.getRevision()).toBe(1);
  });
});
