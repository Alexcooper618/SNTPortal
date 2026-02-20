import { app } from "./app";
import { env } from "./config/env";
import { ensureCoreChatRooms, ensureDefaultTenant } from "./lib/tenant";
import { ensurePlatformAdmin } from "./lib/platform-admin";

const bootstrap = async () => {
  await ensureDefaultTenant();
  await ensurePlatformAdmin();
  await ensureCoreChatRooms();

  app.listen(env.port, () => {
    console.log(`SNT backend started on port ${env.port}`);
  });
};

bootstrap().catch((error) => {
  console.error("Failed to start backend", error);
  process.exit(1);
});
