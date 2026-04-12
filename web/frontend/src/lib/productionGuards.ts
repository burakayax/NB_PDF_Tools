/**
 * Üretimde hafif caydırıcılar (sağ tık / yaygın devPLARTFORM kısayolları).
 * Gerçek güvenlik değildir; her zaman atlanabilir.
 */
export function installProductionGuards(): void {
  if (!import.meta.env.PROD) {
    return;
  }

  const blockContextMenu = import.meta.env.VITE_BLOCK_CONTEXT_MENU !== "false";
  if (blockContextMenu) {
    document.addEventListener(
      "contextmenu",
      (e) => {
        e.preventDefault();
      },
      { capture: true },
    );
  }

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "F12") {
        e.preventDefault();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (e.shiftKey && mod && (e.key === "I" || e.key === "J")) {
        e.preventDefault();
      }
    },
    { capture: true },
  );
}
