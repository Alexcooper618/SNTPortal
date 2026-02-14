interface AuthUserPayload {
  userId: number;
  tenantId: number;
  role: "USER" | "CHAIRMAN";
  sessionId?: string;
}

declare module "express" {
  interface ParamsDictionary {
    [key: string]: string;
  }

  export interface Request<
    B = any,
    P extends ParamsDictionary = ParamsDictionary,
    Q = Record<string, unknown>
  > {
    body: B;
    params: P;
    query: Q;
    path: string;
    method: string;
    ip?: string;
    headers: Record<string, string | string[] | undefined>;
    user?: AuthUserPayload;
    requestId?: string;
    get: (name: string) => string | undefined;
  }

  export interface Response {
    json: (body: any) => Response;
    send: (body?: any) => Response;
    status: (code: number) => Response;
  }

  export type NextFunction = (err?: unknown) => void;

  export interface Router {
    post: (path: string, ...handlers: any[]) => any;
    get: (path: string, ...handlers: any[]) => any;
    patch: (path: string, ...handlers: any[]) => any;
    put: (path: string, ...handlers: any[]) => any;
    delete: (path: string, ...handlers: any[]) => any;
    use: (...handlers: any[]) => any;
  }

  export interface Application extends Router {
    listen: (port: number | string, cb?: () => void) => any;
  }

  export type RequestHandler = (
    req: Request,
    res: Response,
    next: NextFunction
  ) => unknown;

  type ExpressFunction = (() => Application) & {
    json: () => any;
    static: (root: string) => any;
  };

  const express: ExpressFunction;

  export function Router(): Router;

  export default express;
}

declare module "cors" {
  type CorsMiddleware = (...args: any[]) => any;
  export default function cors(): CorsMiddleware;
}
