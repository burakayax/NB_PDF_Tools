import { useEffect, useId, useRef } from "react";
import type { Language } from "../../i18n/landing";
import { conversionUpgradeModalCopy } from "../../i18n/conversionUpgradeModal";

export type ConversionUpgradeModalProps = {
  open: boolean;
  onClose: () => void;
  onContinueWithoutWaiting: () => void;
  onMaybeLater: () => void;
  language: Language;
  operationsToday: number;
};

export function ConversionUpgradeModal({
  open,
  onClose,
  onContinueWithoutWaiting,
  onMaybeLater,
  language,
  operationsToday,
}: ConversionUpgradeModalProps) {
  const C = conversionUpgradeModalCopy(language);
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const t = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLButtonElement>(".conv-upgrade-modal__cta-primary")?.focus();
    }, 120);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="conv-upgrade-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        className="conv-upgrade-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <div className="conv-upgrade-modal__accent" aria-hidden />
        <div className="conv-upgrade-modal__head">
          <p className="conv-upgrade-modal__eyebrow" aria-hidden>
            {language === "tr" ? "Hız farkı" : "Speed"}
          </p>
          <button type="button" className="conv-upgrade-modal__close" onClick={onClose} aria-label={C.close}>
            ×
          </button>
        </div>

        <h2 id={titleId} className="conv-upgrade-modal__title">
          {C.title}
        </h2>
        <p id={descId} className="conv-upgrade-modal__subtitle">
          {C.subtitle}
        </p>

        <p className="conv-upgrade-modal__speed" role="status">
          {C.speedStrip}
        </p>

        <ul className="conv-upgrade-modal__features">
          {C.features.map((line) => (
            <li key={line}>
              <span className="conv-upgrade-modal__check" aria-hidden>
                ✓
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>

        <p className="conv-upgrade-modal__usage">{C.usageLine(operationsToday)}</p>

        <div className="conv-upgrade-modal__actions">
          <button type="button" className="conv-upgrade-modal__cta-primary" onClick={onContinueWithoutWaiting}>
            {C.ctaPrimary}
          </button>
          <button type="button" className="conv-upgrade-modal__cta-secondary" onClick={onMaybeLater}>
            {C.ctaSecondary}
          </button>
        </div>
      </div>
    </div>
  );
}
