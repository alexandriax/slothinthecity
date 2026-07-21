"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EDUCATION_CONTEXT_LABELS,
  factsForContext,
  wikipediaUrlForFact,
  type EducationContext,
} from "./educationFacts";

type EducationalCalloutsProps = {
  active: boolean;
  context: EducationContext;
  onOpenChange?: (open: boolean) => void;
};

const FACT_ROTATION_MS = 18_000;
const CALLOUT_DURATION_MS = 7_000;

function requestPreviousPointerLock(element: Element | null) {
  if (!(element instanceof HTMLCanvasElement) || !element.isConnected) return;
  try {
    Promise.resolve(element.requestPointerLock()).catch(() => undefined);
  } catch {
    // Pointer Lock is optional and can be denied by the browser.
  }
}

export function EducationalCallouts({
  active,
  context,
  onOpenChange,
}: EducationalCalloutsProps) {
  const facts = useMemo(() => factsForContext(context), [context]);
  const [factIndex, setFactIndex] = useState(0);
  const [calloutVisible, setCalloutVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [discoveredIds, setDiscoveredIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const pointerLockElement = useRef<Element | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const modal = useRef<HTMLElement>(null);
  const activeFact = facts[factIndex % Math.max(facts.length, 1)];

  useEffect(() => {
    if (!active || open || facts.length === 0) return;

    let hideTimer = 0;
    const revealTimer = window.setTimeout(() => {
      setFactIndex(0);
      setCalloutVisible(true);
      hideTimer = window.setTimeout(
        () => setCalloutVisible(false),
        CALLOUT_DURATION_MS,
      );
    });
    const rotationTimer = window.setInterval(() => {
      setFactIndex(index => (index + 1) % facts.length);
      setCalloutVisible(true);
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(
        () => setCalloutVisible(false),
        CALLOUT_DURATION_MS,
      );
    }, FACT_ROTATION_MS);

    return () => {
      window.clearTimeout(revealTimer);
      window.clearInterval(rotationTimer);
      window.clearTimeout(hideTimer);
    };
  }, [active, context, facts.length, open]);

  const openModal = useCallback(() => {
    if (!active || !activeFact) return;
    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    pointerLockElement.current = document.pointerLockElement;
    if (document.pointerLockElement && typeof document.exitPointerLock === "function") {
      try {
        Promise.resolve(document.exitPointerLock()).catch(() => undefined);
      } catch {
        // Continue opening the readable overlay if Pointer Lock cannot exit.
      }
    }
    setDiscoveredIds(current => {
      const next = new Set(current);
      next.add(activeFact.id);
      return next;
    });
    setCalloutVisible(false);
    setOpen(true);
    onOpenChange?.(true);
  }, [active, activeFact, onOpenChange]);

  const closeModal = useCallback(() => {
    setOpen(false);
    onOpenChange?.(false);
    const lockedCanvas = pointerLockElement.current;
    pointerLockElement.current = null;
    requestPreviousPointerLock(lockedCanvas);
    if (!lockedCanvas) previousFocus.current?.focus();
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => closeButton.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (active || !open) return;
    const timer = window.setTimeout(() => {
      pointerLockElement.current = null;
      setOpen(false);
      onOpenChange?.(false);
    });
    return () => window.clearTimeout(timer);
  }, [active, onOpenChange, open]);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.code === "Tab" && open) {
        const focusable = [...(modal.current?.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ) ?? [])];
        if (focusable.length > 0) {
          const first = focusable[0], last = focusable[focusable.length - 1];
          if (event.shiftKey && (document.activeElement === first || !modal.current?.contains(document.activeElement))) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
        return;
      }
      if (event.code === "Escape" && open) {
        event.preventDefault();
        event.stopPropagation();
        closeModal();
        return;
      }
      if (
        event.code !== "KeyI" ||
        event.repeat ||
        !active ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (open) closeModal();
      else openModal();
    };
    document.addEventListener("keydown", keyDown, true);
    return () => document.removeEventListener("keydown", keyDown, true);
  }, [active, closeModal, open, openModal]);

  if (!active || !activeFact) return null;

  const selectFact = (offset: number) => {
    setFactIndex(index => {
      const nextIndex = (index + offset + facts.length) % facts.length;
      const nextFact = facts[nextIndex];
      if (nextFact) {
        setDiscoveredIds(current => {
          const next = new Set(current);
          next.add(nextFact.id);
          return next;
        });
      }
      return nextIndex;
    });
  };
  const displaySource = activeFact.wikiTitle.replaceAll("_", " ");

  return (
    <aside
      className="education-layer"
      data-education-context={context}
      data-education-open={open ? "true" : "false"}
    >
      {calloutVisible && !open && (
        <div className="education-callout" data-testid="education-callout">
          <div>
            <span>Field Guide · {factIndex + 1}/{facts.length}</span>
            <strong>{activeFact.teaser}</strong>
          </div>
          <button type="button" onClick={openModal} aria-label={`Learn more: ${activeFact.title}`}>
            <kbd>I</kbd> Learn more
          </button>
        </div>
      )}

      {!open && (
        <button
          className="education-launch"
          type="button"
          onClick={openModal}
          aria-label={`Open Field Guide: ${activeFact.title}`}
          aria-haspopup="dialog"
        >
          <span aria-hidden="true">i</span>
          <b>Learn</b>
          <kbd>I</kbd>
        </button>
      )}

      {open && (
        <div
          className="education-modal-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <section
            ref={modal}
            className="education-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="education-title"
            aria-describedby="education-detail"
          >
            <header>
              <div>
                <span>Field Guide · {EDUCATION_CONTEXT_LABELS[context]}</span>
                <small>
                  {discoveredIds.size} discovered · {factIndex + 1} of {facts.length} in this area
                </small>
              </div>
              <button
                ref={closeButton}
                className="education-close"
                type="button"
                onClick={closeModal}
                aria-label="Close Field Guide and return to the game"
              >
                <span aria-hidden="true">×</span>
                <kbd>Esc</kbd>
              </button>
            </header>
            <div className="education-modal-body">
              <div className="education-index" aria-hidden="true">
                {String(factIndex + 1).padStart(2, "0")}
              </div>
              <p className="education-kicker">Did you know?</p>
              <h2 id="education-title">{activeFact.title}</h2>
              <p id="education-detail">{activeFact.detail}</p>
              <a
                href={wikipediaUrlForFact(activeFact)}
                target="_blank"
                rel="noreferrer"
              >
                Read the Wikipedia article
                <span>{displaySource} ↗</span>
              </a>
            </div>
            <footer>
              <button type="button" onClick={() => selectFact(-1)}>
                <span aria-hidden="true">←</span> Previous
              </button>
              <button type="button" onClick={() => selectFact(1)}>
                Next fact <span aria-hidden="true">→</span>
              </button>
            </footer>
          </section>
        </div>
      )}
    </aside>
  );
}
