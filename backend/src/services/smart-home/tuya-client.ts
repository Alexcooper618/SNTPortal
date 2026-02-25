import crypto from "crypto";

interface TuyaClientOptions {
  apiBaseUrl: string;
  oauthAuthorizeUrl: string;
  oauthTokenUrl: string;
  clientId: string;
  clientSecret: string;
}

interface RequestOptions {
  url: string;
  method: "GET" | "POST";
  accessToken?: string;
  body?: string;
  contentType?: string;
}

interface TuyaApiErrorContext {
  status?: number;
  details?: unknown;
}

export class TuyaApiError extends Error {
  status?: number;
  details?: unknown;

  constructor(message: string, context: TuyaApiErrorContext = {}) {
    super(message);
    this.name = "TuyaApiError";
    this.status = context.status;
    this.details = context.details;
  }
}

export interface TuyaOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
  externalUserId: string;
}

export interface TuyaCommandInput {
  code: string;
  value: string | number | boolean;
}

export interface TuyaDeviceDescriptor {
  externalDeviceId: string;
  name: string;
  category: string;
  isOnline: boolean;
  roomName?: string;
  capabilitySnapshot: Record<string, unknown>;
}

export interface TuyaDeviceStatus {
  state: Record<string, unknown>;
  isOnline: boolean;
  raw: unknown;
}

export interface TuyaSendCommandResult {
  success: boolean;
  providerRequestId?: string;
  raw: unknown;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const firstString = (obj: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
};

const firstNumber = (obj: Record<string, unknown>, keys: string[]): number | undefined => {
  for (const key of keys) {
    const value = obj[key];
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const firstBoolean = (obj: Record<string, unknown>, keys: string[]): boolean | undefined => {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value.toLowerCase() === "true") return true;
      if (value.toLowerCase() === "false") return false;
    }
  }
  return undefined;
};

const extractList = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (!isObject(value)) return [];

  const candidates = ["list", "items", "devices", "result", "data"];
  for (const key of candidates) {
    const current = value[key];
    if (Array.isArray(current)) {
      return current;
    }
    if (isObject(current)) {
      const nested = extractList(current);
      if (nested.length > 0) return nested;
    }
  }

  return [];
};

const normalizeEnvelope = (payload: unknown): unknown => {
  if (!isObject(payload)) return payload;
  if (payload.success === false) {
    throw new TuyaApiError(
      typeof payload.msg === "string" ? payload.msg : "Tuya API call failed",
      { details: payload }
    );
  }

  if (Object.prototype.hasOwnProperty.call(payload, "result")) {
    return payload.result;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "data")) {
    return payload.data;
  }

  return payload;
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const withTrailingPath = (baseUrl: string, path: string): string => {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
};

const fallbackExternalUserId = (accessToken: string): string => {
  const hash = crypto.createHash("sha256").update(accessToken).digest("hex").slice(0, 18);
  return `tuya_${hash}`;
};

export class TuyaClient {
  private readonly apiBaseUrl: string;
  private readonly oauthAuthorizeUrl: string;
  private readonly oauthTokenUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(options: TuyaClientOptions) {
    this.apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, "");
    this.oauthAuthorizeUrl = options.oauthAuthorizeUrl;
    this.oauthTokenUrl = options.oauthTokenUrl;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
  }

  buildAuthorizeUrl(params: { state: string; redirectUri: string }): string {
    const url = new URL(this.oauthAuthorizeUrl);
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("state", params.state);
    return url.toString();
  }

  async exchangeAuthorizationCode(params: {
    code: string;
    redirectUri: string;
  }): Promise<TuyaOAuthTokens> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code: params.code,
      redirect_uri: params.redirectUri,
    }).toString();

    const raw = await this.request({
      url: this.oauthTokenUrl,
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      body,
    });

    return this.normalizeOAuthTokens(raw);
  }

  async refreshToken(refreshToken: string): Promise<TuyaOAuthTokens> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
    }).toString();

    const raw = await this.request({
      url: this.oauthTokenUrl,
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      body,
    });

    return this.normalizeOAuthTokens(raw);
  }

  async listUserDevices(accessToken: string, externalUserId: string): Promise<TuyaDeviceDescriptor[]> {
    const raw = await this.request({
      url: withTrailingPath(this.apiBaseUrl, `/v1.0/users/${encodeURIComponent(externalUserId)}/devices`),
      method: "GET",
      accessToken,
    });

    const items = extractList(raw);

    return items
      .map((item): TuyaDeviceDescriptor | null => {
        if (!isObject(item)) return null;

        const externalDeviceId = firstString(item, ["id", "devId", "device_id"]);
        if (!externalDeviceId) return null;

        return {
          externalDeviceId,
          name: firstString(item, ["name", "display_name"]) ?? "Устройство",
          category: firstString(item, ["category", "product_name", "category_name"]) ?? "unknown",
          isOnline: firstBoolean(item, ["online", "is_online", "isOnline"]) ?? false,
          roomName: firstString(item, ["room_name", "roomName", "room"]),
          capabilitySnapshot: {
            raw: item,
            status: isObject(item.status) || Array.isArray(item.status) ? item.status : null,
            functions: isObject(item.functions) || Array.isArray(item.functions) ? item.functions : null,
          },
        };
      })
      .filter((item): item is TuyaDeviceDescriptor => Boolean(item));
  }

  async getDeviceStatus(accessToken: string, externalDeviceId: string): Promise<TuyaDeviceStatus> {
    const raw = await this.request({
      url: withTrailingPath(this.apiBaseUrl, `/v1.0/devices/${encodeURIComponent(externalDeviceId)}/status`),
      method: "GET",
      accessToken,
    });

    const state = this.extractState(raw);
    const isOnline = this.extractOnline(raw);

    return {
      state,
      isOnline,
      raw,
    };
  }

  async sendDeviceCommands(
    accessToken: string,
    externalDeviceId: string,
    commands: TuyaCommandInput[]
  ): Promise<TuyaSendCommandResult> {
    const body = JSON.stringify({ commands });

    const raw = await this.request({
      url: withTrailingPath(this.apiBaseUrl, `/v1.0/devices/${encodeURIComponent(externalDeviceId)}/commands`),
      method: "POST",
      accessToken,
      body,
      contentType: "application/json",
    });

    let providerRequestId: string | undefined;
    if (isObject(raw)) {
      providerRequestId = firstString(raw, ["requestId", "request_id", "id"]);
    }

    return {
      success: true,
      providerRequestId,
      raw,
    };
  }

  private normalizeOAuthTokens(rawPayload: unknown): TuyaOAuthTokens {
    const payload = isObject(rawPayload) ? rawPayload : {};

    const accessToken = firstString(payload, ["access_token", "accessToken", "token"]);
    const refreshToken = firstString(payload, ["refresh_token", "refreshToken"]);
    const externalUserId =
      firstString(payload, ["uid", "user_id", "userId", "open_uid", "openid"]) ??
      (accessToken ? fallbackExternalUserId(accessToken) : undefined);

    if (!accessToken || !refreshToken || !externalUserId) {
      throw new TuyaApiError("OAuth token response is missing required fields", {
        details: rawPayload,
      });
    }

    const expiresInSec = Math.max(60, firstNumber(payload, ["expires_in", "expiresIn", "expire_time"]) ?? 3600);

    return {
      accessToken,
      refreshToken,
      expiresInSec,
      externalUserId,
    };
  }

  private extractState(raw: unknown): Record<string, unknown> {
    if (Array.isArray(raw)) {
      return this.convertStatusArray(raw);
    }

    if (!isObject(raw)) return {};

    const directStatus = raw.status;
    if (Array.isArray(directStatus)) {
      return this.convertStatusArray(directStatus);
    }

    if (isObject(directStatus)) {
      return directStatus;
    }

    const nestedResult = raw.result;
    if (Array.isArray(nestedResult)) {
      return this.convertStatusArray(nestedResult);
    }
    if (isObject(nestedResult)) {
      const nestedStatus = nestedResult.status;
      if (Array.isArray(nestedStatus)) {
        return this.convertStatusArray(nestedStatus);
      }
      if (isObject(nestedStatus)) {
        return nestedStatus;
      }
      return nestedResult;
    }

    return {};
  }

  private extractOnline(raw: unknown): boolean {
    if (!isObject(raw)) return false;

    const direct = firstBoolean(raw, ["online", "isOnline", "is_online"]);
    if (typeof direct === "boolean") return direct;

    const result = raw.result;
    if (isObject(result)) {
      const nested = firstBoolean(result, ["online", "isOnline", "is_online"]);
      if (typeof nested === "boolean") return nested;
    }

    return false;
  }

  private convertStatusArray(values: unknown[]): Record<string, unknown> {
    const state: Record<string, unknown> = {};

    for (const item of values) {
      if (!isObject(item)) continue;
      const key = firstString(item, ["code", "key", "id"]);
      if (!key) continue;
      state[key] = item.value;
    }

    return state;
  }

  private async request(options: RequestOptions): Promise<unknown> {
    let attempt = 0;
    let waitMs = 250;

    while (attempt < 3) {
      attempt += 1;

      try {
        const response = await fetch(options.url, {
          method: options.method,
          headers: {
            ...(options.contentType ? { "Content-Type": options.contentType } : {}),
            ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
            "x-tuya-client-id": this.clientId,
          },
          body: options.body,
        });

        const contentType = response.headers.get("content-type") ?? "";
        const payload = contentType.includes("application/json")
          ? await response.json()
          : await response.text();

        if (!response.ok) {
          if ((response.status === 429 || response.status >= 500) && attempt < 3) {
            await sleep(waitMs);
            waitMs *= 2;
            continue;
          }
          throw new TuyaApiError(`Tuya API request failed (${response.status})`, {
            status: response.status,
            details: payload,
          });
        }

        return normalizeEnvelope(payload);
      } catch (error) {
        if (attempt < 3) {
          await sleep(waitMs);
          waitMs *= 2;
          continue;
        }

        if (error instanceof TuyaApiError) {
          throw error;
        }

        throw new TuyaApiError("Tuya API network error", {
          details: error,
        });
      }
    }

    throw new TuyaApiError("Tuya API request failed after retries");
  }
}
