// Kimlik doğrulama olaylarını konsola yapılandırılmış biçimde yazar (şifre ve token asla yazılmaz).
// Geliştirme sırasında hızlı geri bildirim sağlar; dosya günlüğüne ek olarak kullanılır.
// Buraya hassas alan eklenirse güvenlik ihlali riski doğar; kaldırılırsa yalnızca dosya logu kalır.
function stamp() {
  return new Date().toISOString();
}

export const authLog = {
  info(message: string, meta?: Record<string, unknown>) {
    console.log(`[auth][${stamp()}] ${message}`, meta && Object.keys(meta).length ? meta : "");
  },
  warn(message: string, meta?: Record<string, unknown>) {
    console.warn(`[auth][${stamp()}] ${message}`, meta && Object.keys(meta).length ? meta : "");
  },
  error(message: string, meta?: Record<string, unknown>) {
    console.error(`[auth][${stamp()}] ${message}`, meta && Object.keys(meta).length ? meta : "");
  },
};
