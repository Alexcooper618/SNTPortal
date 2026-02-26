import admin from "firebase-admin";
import { env } from "../config/env";

let initialized = false;
let available = false;

const initFirebase = () => {
  if (initialized) {
    return;
  }

  initialized = true;

  if (!env.pushNotificationsEnabled) {
    available = false;
    return;
  }

  if (!env.fcmServiceAccountJson.trim()) {
    available = false;
    return;
  }

  try {
    const parsed = JSON.parse(env.fcmServiceAccountJson) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };

    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      available = false;
      return;
    }

    const credential = admin.credential.cert({
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key.replace(/\\n/g, "\n"),
    });

    if (admin.apps.length === 0) {
      admin.initializeApp({ credential });
    }

    available = true;
  } catch (_error) {
    available = false;
  }
};

const toDataMap = (value: Record<string, string | number | boolean | null | undefined> | undefined) => {
  if (!value) return undefined;
  const data: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || item === null) continue;
    data[key] = String(item);
  }
  return Object.keys(data).length > 0 ? data : undefined;
};

export const sendPushNotifications = async (params: {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, string | number | boolean | null | undefined>;
}) => {
  initFirebase();
  if (!available) {
    return { attempted: 0, success: 0, failed: 0 };
  }

  const tokens = Array.from(
    new Set(
      params.tokens
        .map((token) => token.trim())
        .filter((token) => token.length > 20)
    )
  );

  if (tokens.length === 0) {
    return { attempted: 0, success: 0, failed: 0 };
  }

  try {
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: params.title,
        body: params.body,
      },
      data: toDataMap(params.data),
      android: {
        priority: "high",
      },
    });

    return {
      attempted: tokens.length,
      success: response.successCount,
      failed: response.failureCount,
    };
  } catch (_error) {
    return {
      attempted: tokens.length,
      success: 0,
      failed: tokens.length,
    };
  }
};

