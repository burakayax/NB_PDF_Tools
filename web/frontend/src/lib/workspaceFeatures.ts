import type { FeatureKey } from "../api/subscription";
import type { Language } from "../i18n/landing";
import { featureCopy } from "../i18n/workspace";

/** Workspace tool row: structural fields are fixed; copy comes from CMS overlay + `featureCopy` fallback. */
export type WorkspaceFeatureUi = {
  id: FeatureKey;
  title: string;
  icon: string;
  description: string;
  endpoint: string;
  buttonText: string;
  accept: string;
  multiple?: boolean;
  fallbackFilename: string;
};

const REGISTRY: Omit<WorkspaceFeatureUi, "title" | "description" | "buttonText">[] = [
  {
    id: "split",
    icon: "📄",
    endpoint: "split",
    accept: ".pdf,application/pdf",
    fallbackFilename: "ayrılan-sayfalar.pdf",
  },
  {
    id: "merge",
    icon: "🗂",
    endpoint: "merge",
    accept: ".pdf,application/pdf",
    multiple: true,
    fallbackFilename: "birleştirilmiş.pdf",
  },
  {
    id: "pdf-to-word",
    icon: "📝",
    endpoint: "pdf-to-word",
    accept: ".pdf,application/pdf",
    fallbackFilename: "çıktı.docx",
  },
  {
    id: "word-to-pdf",
    icon: "🧾",
    endpoint: "word-to-pdf",
    accept: ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    fallbackFilename: "çıktı.pdf",
  },
  {
    id: "excel-to-pdf",
    icon: "📊",
    endpoint: "excel-to-pdf",
    accept: ".xlsx,.xlsm,.xltx,.xltm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fallbackFilename: "çıktı.pdf",
  },
  {
    id: "pdf-to-excel",
    icon: "📈",
    endpoint: "pdf-to-excel",
    accept: ".pdf,application/pdf",
    fallbackFilename: "çıktı.xlsx",
  },
  {
    id: "compress",
    icon: "🗜",
    endpoint: "compress",
    accept: ".pdf,application/pdf",
    fallbackFilename: "sıkıştırılmış.pdf",
  },
  {
    id: "encrypt",
    icon: "🔒",
    endpoint: "encrypt",
    accept: ".pdf,application/pdf",
    fallbackFilename: "şifreli.pdf",
  },
];

export const WORKSPACE_TOOL_IDS: FeatureKey[] = REGISTRY.map((r) => r.id);

/**
 * `cms.content.workspace.PLARTFORM[featureId]` overrides title / description / button.
 * `PLARTFORM.config.disabledFeatures` (via runtime) removes PLARTFORM from the list.
 */
export function buildWorkspaceFeaturesFromCms(
  language: Language,
  cms: Record<string, unknown> | null | undefined,
  disabledFeatures: string[],
): WorkspaceFeatureUi[] {
  const disabled = new Set(disabledFeatures);
  const PLARTFORM = (cms?.workspace as Record<string, unknown> | undefined)?.PLARTFORM as
    | Record<string, { title?: string; description?: string; button?: string; buttonText?: string }>
    | undefined;

  return REGISTRY.filter((r) => !disabled.has(r.id)).map((r) => {
    const fb = featureCopy(r.id, language);
    const ov = PLARTFORM?.[r.id];
    const btn =
      typeof ov?.button === "string" && ov.button.trim()
        ? ov.button.trim()
        : typeof ov?.buttonText === "string" && ov.buttonText.trim()
          ? ov.buttonText.trim()
          : fb.button;
    return {
      ...r,
      title: typeof ov?.title === "string" && ov.title.trim() ? ov.title.trim() : fb.title,
      description: typeof ov?.description === "string" && ov.description.trim() ? ov.description.trim() : fb.description,
      buttonText: btn,
    };
  });
}
