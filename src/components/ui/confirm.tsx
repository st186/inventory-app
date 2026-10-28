"use client";

import * as React from "react";
import { createRoot } from "react-dom/client";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog@1.1.6";

import { cn } from "./utils";
import { Button } from "./button";
import { Field } from "./field";
import { Input } from "./input";
import { Textarea } from "./textarea";
import { useT } from "../../utils/i18n";

// Promise-based replacements for window.confirm / window.prompt.
//
//   if (await confirm({ title: "Delete this expense?", body: "₹600 · Chicken · 27 Oct",
//                       confirmLabel: "Delete expense", tone: "danger" })) { ...delete... }
//
//   const reason = await promptText({ title: "Reject day close", label: "Reason", required: true });
//   if (reason !== null) { ... }
//
//   // Typed confirmation for the scariest actions (restore a backup):
//   await confirm({ title: "Restore backup?", confirmLabel: "Restore", tone: "danger", requireText: "RESTORE" });
//
// Label the confirm button with the verb ("Delete expense"), not "OK". Mount <ConfirmProvider>
// once near the root; if it isn't mounted the first call mounts a host by itself.

export type ConfirmOptions = {
  title: string;
  /** One line saying what will happen. */
  body?: React.ReactNode;
  /** The verb: "Delete expense", "Send day close". Default "Confirm". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger = red confirm button (deleting, rejecting, discarding). */
  tone?: "danger" | "primary";
  /** The person must type this word before the confirm button works. */
  requireText?: string;
};

export type PromptOptions = {
  title: string;
  body?: React.ReactNode;
  /** Field label (always visible). */
  label: string;
  helper?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  required?: boolean;
  multiline?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  /** Return an error message to block the answer, or null when it's fine. */
  validate?: (value: string) => string | null;
};

type Request =
  | { id: number; kind: "confirm"; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { id: number; kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void };

let queue: Request[] = [];
let nextId = 1;
let nextHostId = 1;
/** Mounted hosts, oldest first; only the oldest renders, so a dialog never shows twice. */
let hosts: number[] = [];
let autoHostCreated = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

function ensureHost() {
  if (hosts.length > 0 || autoHostCreated || typeof document === "undefined") return;
  autoHostCreated = true;
  const el = document.createElement("div");
  el.setAttribute("data-confirm-host", "");
  document.body.appendChild(el);
  createRoot(el).render(<ConfirmHost />);
}

function enqueue(request: Request) {
  queue = [...queue, request];
  emit();
  ensureHost();
}

function settle(id: number) {
  queue = queue.filter((r) => r.id !== id);
  emit();
}

/** Ask a yes/no question. Resolves true when confirmed, false when cancelled or dismissed. */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => enqueue({ id: nextId++, kind: "confirm", options, resolve }));
}

/** Ask for a short text answer. Resolves the text, or null when cancelled. */
export function promptText(options: PromptOptions): Promise<string | null> {
  return new Promise<string | null>((resolve) => enqueue({ id: nextId++, kind: "prompt", options, resolve }));
}

/** Same functions as a hook, for components that prefer hooks. */
export function useConfirm() {
  return { confirm, promptText };
}

function useQueue() {
  return React.useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => queue,
    () => queue,
  );
}

function ConfirmHost() {
  const { t } = useT();
  const requests = useQueue();
  const current = requests[0];
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const answered = React.useRef(false);

  const [hostId] = React.useState(() => nextHostId++);
  React.useLayoutEffect(() => {
    hosts = [...hosts, hostId];
    emit();
    return () => {
      hosts = hosts.filter((h) => h !== hostId);
      emit();
    };
  }, [hostId]);
  const isActiveHost = React.useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => hosts[0] === hostId,
    () => false,
  );

  React.useEffect(() => {
    if (!current || !isActiveHost) return;
    answered.current = false;
    setText(current.kind === "prompt" ? current.options.defaultValue ?? "" : "");
    setError(null);
    setOpen(true);
  }, [current?.id, isActiveHost]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!current || !isActiveHost) return null;

  const finish = (ok: boolean) => {
    if (answered.current) return;
    answered.current = true;
    if (current.kind === "confirm") current.resolve(ok);
    else current.resolve(ok ? text : null);
    setOpen(false);
    const id = current.id;
    window.setTimeout(() => settle(id), 160);
  };

  const options = current.options;
  const tone = options.tone ?? "primary";
  const requireText = current.kind === "confirm" ? current.options.requireText : undefined;

  const submit = () => {
    if (current.kind === "prompt") {
      const value = text.trim();
      if (current.options.required && !value) {
        setError(t("common.required"));
        return;
      }
      const problem = current.options.validate?.(text) ?? null;
      if (problem) {
        setError(problem);
        return;
      }
    }
    finish(true);
  };

  const blocked = requireText ? text.trim() !== requireText : false;

  return (
    <AlertDialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) finish(false);
      }}
    >
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-(--z-toast) bg-scrim data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <AlertDialogPrimitive.Content
          data-slot="confirm-dialog"
          onEscapeKeyDown={() => finish(false)}
          className={cn(
            "fixed top-1/2 left-1/2 z-(--z-toast) flex w-[calc(100%-2rem)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-border bg-surface p-5 text-text shadow-e3 outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-98 data-[state=open]:zoom-in-98",
          )}
        >
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!blocked) submit();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <AlertDialogPrimitive.Title className="text-title font-semibold text-text">{options.title}</AlertDialogPrimitive.Title>
              {options.body ? (
                <AlertDialogPrimitive.Description className="text-body-sm text-text-2">{options.body}</AlertDialogPrimitive.Description>
              ) : (
                <AlertDialogPrimitive.Description className="sr-only">{options.title}</AlertDialogPrimitive.Description>
              )}
            </div>

            {current.kind === "prompt" && (
              <Field label={current.options.label} helper={current.options.helper} error={error} required={current.options.required}>
                {current.options.multiline ? (
                  <Textarea autoFocus value={text} placeholder={current.options.placeholder} onChange={(e) => { setText(e.target.value); setError(null); }} />
                ) : (
                  <Input
                    autoFocus
                    value={text}
                    inputMode={current.options.inputMode}
                    placeholder={current.options.placeholder}
                    onChange={(e) => {
                      setText(e.target.value);
                      setError(null);
                    }}
                  />
                )}
              </Field>
            )}

            {requireText && (
              <Field label={t("common.typeToConfirm", { word: requireText })}>
                <Input autoFocus autoComplete="off" autoCapitalize="characters" value={text} onChange={(e) => setText(e.target.value)} />
              </Field>
            )}

            <div className="flex flex-col-reverse gap-2.5 min-[360px]:flex-row min-[360px]:justify-end">
              <AlertDialogPrimitive.Cancel asChild>
                <Button variant="secondary" className="min-[360px]:min-w-24">
                  {options.cancelLabel ?? t("common.cancel")}
                </Button>
              </AlertDialogPrimitive.Cancel>
              <Button type="submit" variant={tone === "danger" ? "danger" : "primary"} disabled={blocked}>
                {options.confirmLabel ?? t("common.confirm")}
              </Button>
            </div>
          </form>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}

/** Mount once near the root (inside any LanguageOverride) so dialogs share the app's context. */
function ConfirmProvider({ children }: { children?: React.ReactNode }) {
  return (
    <>
      {children}
      <ConfirmHost />
    </>
  );
}

export { ConfirmProvider, ConfirmHost };
