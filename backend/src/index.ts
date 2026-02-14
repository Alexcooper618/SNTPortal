import { app } from "./app";
import { env } from "./config/env";
import { ensureCoreChatRooms, ensureDefaultTenant } from "./lib/tenant";

const bootstrap = async () => {
  await ensureDefaultTenant();
  await ensureCoreChatRooms();

  app.listen(env.port, () => {
    console.log(`SNT backend started on port ${env.port}`);
  });
};

bootstrap().catch((error) => {
  console.error("Failed to start backend", error);
  process.exit(1);
});
