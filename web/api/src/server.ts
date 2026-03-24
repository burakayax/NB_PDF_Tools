import { app } from "./app.js";
import { env } from "./config/env.js";
import { ensureDefaultAdminUser } from "./lib/ensure-default-admin.js";
import { prepareLogFile } from "./lib/file-log.js";

// Günlük dizinini hazırlayıp varsayılan yöneticiyi oluşturur; HTTP dinlemeden önce çalışmalıdır.
// Erken hatalar (ör. DB veya disk) burada yakalanır; dinleyici başlamadan ortam doğrulanır.
// Sıra tersine çevrilirse ilk istekler log veya admin eksikliğiyle karşılaşabilir.
await prepareLogFile();
await ensureDefaultAdminUser();

app.listen(env.PORT, () => {
  console.log(`NB PDF Tools auth API listening on http://localhost:${env.PORT}`);
});
