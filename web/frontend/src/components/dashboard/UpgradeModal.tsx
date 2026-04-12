import { useEffect } from "react";
import type { PublicPricingPayload } from "../../api/public";
import { PricingPsychologyStack } from "../PricingPsychologyStack";
import { formatRegionalPlanPrice, regionalCurrencyHint } from "../../lib/formatRegionalPrice";
import { getAnnualPricePsychology, getMonthlyPricePsychology } from "../../lib/pricingPsychology";
import type { Language } from "../../i18n/landing";
import { pricingSectionCopy } from "../../i18n/pricingSection";
import { upgradeModalCopy } from "../../i18n/upgradeModal";

type UpgradeModalProps = {
  open: boolean;
  onClose: () => void;
  language: Language;
  pricing?: PublicPricingPayload;
  onSelectBasic: () => void;
  onSelectPro: () => void;
  onSelectProAnnual: () => void;
};

export function UpgradeModal({
  open,
  onClose,
  language,
  pricing,
  onSelectBasic,
  onSelectPro,
  onSelectProAnnual,
}: UpgradeModalProps) {
  const C = upgradeModalCopy(language);
  const P = pricingSectionCopy(language);
  const hint = regionalCurrencyHint(pricing, language);
  const savePct = pricing?.annualSavePercent ?? 0;

  const pb = formatRegionalPlanPrice(pricing, "basicMonthly", language);
  const pm = formatRegionalPlanPrice(pricing, "proMonthly", language);
  const pa = formatRegionalPlanPrice(pricing, "proAnnual", language);
  const freeLabel = language === "tr" ? "Ücretsiz" : "Free";
  const perDay = (amount: string) => P.onlyPerDay(amount);
  const psychBasic = getMonthlyPricePsychology(pricing, "basic", language, perDay);
  const psychPro = getMonthlyPricePsychology(pricing, "pro", language, perDay);
  const psychAnnual = getAnnualPricePsychology(pricing, language, perDay);

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
        className="upgrade-modal upgrade-modal--regional"
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
        <p className="upgrade-modal__region-hint">
          {pricing?.pricingRegion === "TR" ? P.regionTry : P.regionIntl}
        </p>
        {hint ? <p className="upgrade-modal__intl-note">{hint}</p> : null}

        <div className="upgrade-modal__plans upgrade-modal__plans--four">
          <article className="upgrade-modal__plan upgrade-modal__plan--free">
            <h3 className="upgrade-modal__plan-name">{C.planFree}</h3>
            <p className="upgrade-modal__plan-price upgrade-modal__plan-price--sm">{freeLabel}</p>
            <ul className="upgrade-modal__list upgrade-modal__list--compact">
              {C.freeBullets.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </article>

          <article className="upgrade-modal__plan upgrade-modal__plan--business">
            <h3 className="upgrade-modal__plan-name">{C.planBasic}</h3>
            <PricingPsychologyStack
              variant="modal"
              stack={psychBasic}
              fallback={<p className="upgrade-modal__plan-price upgrade-modal__plan-price--sm">{pb}</p>}
            />
            <ul className="upgrade-modal__list upgrade-modal__list--compact">
              {C.basicBullets.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <button type="button" className="upgrade-modal__cta upgrade-modal__cta--business" onClick={onSelectBasic}>
              {C.ctaBasic}
            </button>
          </article>

          <article className="upgrade-modal__plan upgrade-modal__plan--pro">
            <span className="upgrade-modal__ribbon upgrade-modal__ribbon--popular">{C.mostPopular}</span>
            <h3 className="upgrade-modal__plan-name">{C.planPro}</h3>
            <PricingPsychologyStack
              variant="modal"
              stack={psychPro}
              fallback={<p className="upgrade-modal__plan-price upgrade-modal__plan-price--sm">{pm}</p>}
            />
            <ul className="upgrade-modal__list upgrade-modal__list--compact">
              {C.proBullets.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <button type="button" className="upgrade-modal__cta upgrade-modal__cta--pro" onClick={onSelectPro}>
              {C.ctaPro}
            </button>
          </article>

          <article className="upgrade-modal__plan upgrade-modal__plan--annual">
            {savePct > 0 ? (
              <span className="upgrade-modal__ribbon upgrade-modal__ribbon--save">{C.saveAnnual(savePct)}</span>
            ) : null}
            <h3 className="upgrade-modal__plan-name">{C.planAnnual}</h3>
            <PricingPsychologyStack
              variant="modal"
              stack={psychAnnual}
              fallback={<p className="upgrade-modal__plan-price upgrade-modal__plan-price--sm">{pa}</p>}
            />
            <ul className="upgrade-modal__list upgrade-modal__list--compact">
              {C.annualBullets.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <button type="button" className="upgrade-modal__cta upgrade-modal__cta--annual" onClick={onSelectProAnnual}>
              {C.ctaAnnual}
            </button>
          </article>
        </div>

        <div className="upgrade-modal__compare-wrap">
          <p className="upgrade-modal__compare-title">{P.compareTitle}</p>
          <div className="upgrade-modal__compare-scroll">
            <table className="upgrade-modal__compare-table">
              <thead>
                <tr>
                  <th />
                  <th>{P.compareColFree}</th>
                  <th>{P.compareColBasic}</th>
                  <th>{P.compareColPro}</th>
                  <th>{P.compareColAnnual}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{P.rowPrice}</td>
                  <td>{freeLabel}</td>
                  <td>{pb}</td>
                  <td>{pm}</td>
                  <td>{pa}</td>
                </tr>
                <tr>
                  <td>{P.rowProcessing}</td>
                  <td>{P.valQueue}</td>
                  <td>{P.featBasicNote}</td>
                  <td>{P.valInstant}</td>
                  <td>{P.valInstant}</td>
                </tr>
                <tr>
                  <td>{P.rowDaily}</td>
                  <td>{P.valLimited}</td>
                  <td>{P.valUnlimited}</td>
                  <td>{P.valUnlimited}</td>
                  <td>{P.valUnlimited}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="upgrade-modal__trust">
          <span>{P.trustCancel}</span>
          <span className="upgrade-modal__trust-sep" aria-hidden>
            ·
          </span>
          <span>{P.trustSecure}</span>
        </div>
      </div>
    </div>
  );
}
