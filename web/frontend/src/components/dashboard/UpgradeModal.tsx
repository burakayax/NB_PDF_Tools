import { useEffect } from "react";
import type { Language } from "../../i18n/landing";
import { upgradeModalCopy } from "../../i18n/upgradeModal";

type UpgradeModalProps = {
  open: boolean;
  onClose: () => void;
  language: Language;
  onSelectPro: () => void;
  onSelectBusiness: () => void;
};

export function UpgradeModal({ open, onClose, language, onSelectPro, onSelectBusiness }: UpgradeModalProps) {
  const C = upgradeModalCopy(language);

  useEffect(() => {
    if (!open) {
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

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

  if (!open) {
    return null;
  }

  return (
    <div
      className="upgrade-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="upgrade-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-modal-title"
        aria-describedby="upgrade-modal-subtitle"
      >
        <div className="upgrade-modal__glow" aria-hidden />

        <div className="upgrade-modal__header">
          <div className="upgrade-modal__brand">
            <span className="upgrade-modal__brand-mark">NB</span>
            <span className="upgrade-modal__brand-text">PDF TOOLS</span>
          </div>
          <button type="button" className="upgrade-modal__close" onClick={onClose} aria-label={C.close}>
            ×
          </button>
        </div>

        <h2 id="upgrade-modal-title" className="upgrade-modal__title">
          {C.title}
        </h2>
        <p id="upgrade-modal-subtitle" className="upgrade-modal__subtitle">
          {C.subtitle}
        </p>

        <div className="upgrade-modal__plans">
          <article className="upgrade-modal__plan upgrade-modal__plan--free">
            <h3 className="upgrade-modal__plan-name">{C.planFree}</h3>
            <ul className="upgrade-modal__list">
              {C.freeBullets.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </article>

          <article className="upgrade-modal__plan upgrade-modal__plan--pro">
            <span className="upgrade-modal__ribbon">{C.recommended}</span>
            <h3 className="upgrade-modal__plan-name">{C.planPro}</h3>
            <ul className="upgrade-modal__list">
              {C.proBullets.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <button type="button" className="upgrade-modal__cta upgrade-modal__cta--pro" onClick={onSelectPro}>
              {C.ctaPro}
            </button>
          </article>

          <article className="upgrade-modal__plan upgrade-modal__plan--business">
            <h3 className="upgrade-modal__plan-name">{C.planBusiness}</h3>
            <ul className="upgrade-modal__list">
              {C.businessBullets.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <button type="button" className="upgrade-modal__cta upgrade-modal__cta--business" onClick={onSelectBusiness}>
              {C.ctaBusiness}
            </button>
          </article>
        </div>
      </div>
    </div>
  );
}
