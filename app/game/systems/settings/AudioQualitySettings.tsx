"use client";

import { useId, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { PremiumAudioDirector } from "../audio/PremiumAudioDirector";
import type { AdaptiveQualityManager, QualityMode } from "../quality/AdaptiveQualityManager";

type AudioQualitySettingsProps = {
  audio: PremiumAudioDirector;
  quality: AdaptiveQualityManager;
  className?: string;
  defaultOpen?: boolean;
};

const panelStyle: CSSProperties = {
  position: "absolute",
  zIndex: 120,
  top: "calc(100% + 10px)",
  right: 0,
  width: "min(330px, calc(100vw - 28px))",
  padding: 16,
  border: "1px solid rgba(210, 235, 168, .28)",
  borderRadius: 14,
  color: "#eef4df",
  background: "linear-gradient(145deg, rgba(12, 24, 19, .96), rgba(8, 14, 12, .94))",
  boxShadow: "0 18px 55px rgba(0, 0, 0, .48), inset 0 1px rgba(255, 255, 255, .06)",
  backdropFilter: "blur(18px)",
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
};

const labelStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  marginTop: 11,
  color: "rgba(238, 244, 223, .82)",
  fontSize: 11,
  fontWeight: 760,
  letterSpacing: ".12em",
  textTransform: "uppercase",
};

const buttonStyle: CSSProperties = {
  minWidth: 42,
  minHeight: 42,
  border: "1px solid rgba(210, 235, 168, .26)",
  borderRadius: 999,
  color: "#eff8d5",
  background: "rgba(10, 20, 16, .84)",
  boxShadow: "0 8px 26px rgba(0, 0, 0, .28)",
  cursor: "pointer",
  font: "700 12px/1 Inter, ui-sans-serif, system-ui, sans-serif",
  letterSpacing: ".08em",
};

const QUALITY_OPTIONS: { value: QualityMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Med" },
  { value: "high", label: "High" },
  { value: "ultra", label: "Ultra" },
];

export function AudioQualitySettings({ audio, quality, className, defaultOpen = false }: AudioQualitySettingsProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const audioState = useSyncExternalStore(audio.subscribe, audio.getSnapshot, audio.getSnapshot);
  const qualityState = useSyncExternalStore(quality.subscribe, quality.getSnapshot, quality.getSnapshot);

  return <div className={className} style={{ position: "relative", pointerEvents: "auto" }}>
    <button
      type="button"
      aria-controls={panelId}
      aria-expanded={open}
      aria-label={open ? "Close audio and graphics settings" : "Open audio and graphics settings"}
      onClick={() => { audio.playUiConfirm(); setOpen(value => !value); }}
      style={buttonStyle}
    >
      {open ? "×" : "⚙"}
    </button>
    {open && <section id={panelId} aria-label="Audio and graphics settings" style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <div style={{ color: "#d9ef8b", fontSize: 10, fontWeight: 800, letterSpacing: ".2em", textTransform: "uppercase" }}>Experience</div>
          <div style={{ marginTop: 4, fontFamily: "Georgia, serif", fontSize: 21 }}>Audio & graphics</div>
        </div>
        <button type="button" onClick={() => audio.toggleMuted()} style={{ ...buttonStyle, minHeight: 34, paddingInline: 12 }}>
          {audioState.muted ? "UNMUTE" : "MUTE"}
        </button>
      </div>

      {!audioState.unlocked && <button
        type="button"
        onClick={() => void audio.unlock()}
        style={{ ...buttonStyle, width: "100%", marginTop: 14, borderRadius: 8, background: "rgba(189, 220, 108, .14)" }}
      >ENABLE PREMIUM AUDIO</button>}

      <div style={{ marginTop: 15, paddingTop: 12, borderTop: "1px solid rgba(224, 239, 192, .12)" }}>
        <div style={{ color: "rgba(238, 244, 223, .55)", fontSize: 10, fontWeight: 800, letterSpacing: ".18em", textTransform: "uppercase" }}>Mix</div>
        <VolumeSlider label="Master" value={audioState.master} onChange={(value) => audio.setMasterVolume(value)}/>
        <VolumeSlider label="Music" value={audioState.music} onChange={(value) => audio.setMusicVolume(value)}/>
        <VolumeSlider label="Ambience" value={audioState.ambience} onChange={(value) => audio.setAmbienceVolume(value)}/>
        <VolumeSlider label="Effects" value={audioState.sfx} onChange={(value) => audio.setSfxVolume(value)}/>
      </div>

      <fieldset style={{ margin: "15px 0 0", padding: "12px 0 0", border: 0, borderTop: "1px solid rgba(224, 239, 192, .12)" }}>
        <legend style={{ padding: 0, color: "rgba(238, 244, 223, .55)", fontSize: 10, fontWeight: 800, letterSpacing: ".18em", textTransform: "uppercase" }}>Character & graphics detail</legend>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 5, marginTop: 10 }}>
          {QUALITY_OPTIONS.map(({ value, label }) => {
            const selected = qualityState.mode === value;
            return <button
              key={value}
              type="button"
              aria-pressed={selected}
              onClick={() => { quality.setMode(value); audio.playUiConfirm(); }}
              style={{
                minHeight: 34,
                padding: "0 4px",
                border: `1px solid ${selected ? "rgba(217, 239, 139, .72)" : "rgba(224, 239, 192, .12)"}`,
                borderRadius: 7,
                color: selected ? "#efffb9" : "rgba(238, 244, 223, .64)",
                background: selected ? "rgba(178, 213, 90, .16)" : "rgba(255, 255, 255, .025)",
                cursor: "pointer",
                font: "750 10px/1 Inter, ui-sans-serif, system-ui, sans-serif",
                textTransform: "uppercase",
              }}
            >{label}</button>;
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 10, color: "rgba(238, 244, 223, .56)", fontSize: 11, lineHeight: 1.4 }}>
          <span>{qualityState.reason}. High is the default on desktop and mobile; choose Medium or Low for lighter authored characters.</span>
          <span style={{ flex: "0 0 auto", color: "#d9ef8b", fontWeight: 800, textTransform: "uppercase" }}>{qualityState.activeLevel}{qualityState.averageFps ? ` · ${Math.round(qualityState.averageFps)} FPS` : ""}</span>
        </div>
      </fieldset>
    </section>}
  </div>;
}

function VolumeSlider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label style={labelStyle}>
    <span>{label}</span>
    <span style={{ display: "flex", alignItems: "center", gap: 8, width: "64%" }}>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        style={{ width: "100%", accentColor: "#d9ef8b" }}
      />
      <output style={{ width: 29, color: "rgba(238, 244, 223, .58)", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{Math.round(value * 100)}</output>
    </span>
  </label>;
}
