"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  EDUCATION_CONTEXT_LABELS,
  factsForContext,
  wikipediaUrlForFact,
  type EducationContext,
} from "./educationFacts";

type EducationOverlayProps = {
  context: EducationContext;
  viewportRef: RefObject<HTMLDivElement | null>;
};

const CALLOUT_VISIBLE_MS = 7_000;
const FACT_ROTATION_MS = 18_000;
const GAMEPLAY_KEYS = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ControlLeft",
  "ControlRight",
  "KeyA",
  "KeyC",
  "KeyD",
  "KeyE",
  "KeyF",
  "KeyM",
  "KeyP",
  "KeyQ",
  "KeyR",
  "KeyS",
  "KeyW",
  "ShiftLeft",
  "ShiftRight",
  "Space",
]);

function exitPointerLock() {
  if (typeof document.exitPointerLock !== "function") return;
  try {
    Promise.resolve(document.exitPointerLock()).catch(() => undefined);
  } catch {
    // Pointer Lock is optional on mobile and some embedded browsers.
  }
}

function requestPointerLock(canvas: HTMLCanvasElement | null) {
  if (!canvas || typeof canvas.requestPointerLock !== "function") return;
  try {
    Promise.resolve(canvas.requestPointerLock()).catch(() => undefined);
  } catch {
    // A browser may deny restoration after focus moves to another tab.
  }
}

export function EducationOverlay({
  context,
  viewportRef,
}: EducationOverlayProps) {
  const facts = useMemo(() => factsForContext(context), [context]);
  const [factIndex, setFactIndex] = useState(0);
  const [calloutVisible, setCalloutVisible] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const wasPointerLocked = useRef(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const detailId = useId();

  const fact = facts[factIndex % Math.max(1, facts.length)];
  const canvas = useCallback(
    () => viewportRef.current?.querySelector("canvas") ?? null,
    [viewportRef],
  );

  const openModal = useCallback(() => {
    if (!fact) return;
    const viewportCanvas = canvas();
    wasPointerLocked.current = document.pointerLockElement === viewportCanvas;
    if (wasPointerLocked.current) exitPointerLock();
    setModalOpen(true);
    setCalloutVisible(false);
  }, [canvas, fact]);

  const closeModal = useCallback(() => {
    const shouldRestore = wasPointerLocked.current;
    wasPointerLocked.current = false;
    setModalOpen(false);
    if (shouldRestore) {
      requestAnimationFrame(() => requestPointerLock(canvas()));
    }
  }, [canvas]);

  const showPreviousFact = useCallback(() => {
    setFactIndex((current) => (current - 1 + facts.length) % facts.length);
  }, [facts.length]);

  const showNextFact = useCallback(() => {
    setFactIndex((current) => (current + 1) % facts.length);
  }, [facts.length]);

  useEffect(() => {
    if (modalOpen || facts.length < 1) return;
    let hideTimer = window.setTimeout(
      () => setCalloutVisible(false),
      CALLOUT_VISIBLE_MS,
    );
    const rotationTimer = window.setInterval(() => {
      setFactIndex((current) => (current + 1) % facts.length);
      setCalloutVisible(true);
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(
        () => setCalloutVisible(false),
        CALLOUT_VISIBLE_MS,
      );
    }, FACT_ROTATION_MS);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearInterval(rotationTimer);
    };
  }, [context, facts.length, modalOpen]);

  useEffect(() => {
    if (modalOpen) closeButtonRef.current?.focus();
  }, [modalOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.code === "KeyI" &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (modalOpen) closeModal();
        else openModal();
        return;
      }
      if (!modalOpen) return;
      if (event.code === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeModal();
      } else if (event.code === "ArrowLeft") {
        event.preventDefault();
        event.stopImmediatePropagation();
        showPreviousFact();
      } else if (event.code === "ArrowRight") {
        event.preventDefault();
        event.stopImmediatePropagation();
        showNextFact();
      } else if (GAMEPLAY_KEYS.has(event.code)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [closeModal, modalOpen, openModal, showNextFact, showPreviousFact]);

  if (!fact) return null;

  return (
    <>
      <aside
        className={`education-dock ${calloutVisible ? "show-callout" : ""}`}
        aria-label="Contextual field guide"
      >
        <section className="education-callout" aria-live="polite">
          <div className="education-callout-heading">
            <span>Field discovery</span>
            <kbd>I</kbd>
          </div>
          <strong>{fact.title}</strong>
          <p>{fact.teaser}</p>
          <button type="button" onClick={openModal}>
            Open field guide <span aria-hidden="true">→</span>
          </button>
        </section>
        <button
          className="education-info-button"
          type="button"
          onClick={openModal}
          aria-label={`Learn about ${fact.title}. Keyboard shortcut I.`}
          title="Open field guide (I)"
        >
          <b aria-hidden="true">i</b>
          <span>Learn</span>
          <kbd>I</kbd>
        </button>
      </aside>

      {modalOpen && (
        <div
          className="education-modal-backdrop"
          onPointerDown={(event) => {
            if (event.currentTarget === event.target) closeModal();
          }}
        >
          <section
            className="education-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={detailId}
          >
            <header>
              <div>
                <span>{EDUCATION_CONTEXT_LABELS[context]}</span>
                <small>
                  Fact {factIndex + 1} of {facts.length}
                </small>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeModal}
                aria-label="Close field guide and return to the game"
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>
            <div className="education-modal-body">
              <div className="education-modal-mark" aria-hidden="true">
                i
              </div>
              <p className="education-modal-kicker">Look closer</p>
              <h2 id={titleId}>{fact.title}</h2>
              <p className="education-modal-teaser">{fact.teaser}</p>
              <p id={detailId} className="education-modal-detail">
                {fact.detail}
              </p>
              <a
                href={wikipediaUrlForFact(fact)}
                target="_blank"
                rel="noreferrer"
              >
                Read the source on Wikipedia <span aria-hidden="true">↗</span>
              </a>
            </div>
            <footer>
              <button type="button" onClick={showPreviousFact}>
                <span aria-hidden="true">←</span> Previous
              </button>
              <span>
                <kbd>←</kbd> <kbd>→</kbd> browse · <kbd>I</kbd> close
              </span>
              <button type="button" onClick={showNextFact}>
                Next <span aria-hidden="true">→</span>
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
