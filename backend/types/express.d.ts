declare module "express" {
  export interface Request {
    body?: any;
    headers: Record<string, any>;
    user?: {
      userId: number;
      role: string;
      sntId: number;
    };
  }

  export interface Response {
    json: (body: any) => Response;
    status: (code: number) => Response;
  }

  export type NextFunction = (...args: any[]) => any;

  export interface Router {
    post: (...args: any[]) => any;
    get: (...args: any[]) => any;
    use: (...args: any[]) => any;
  }

  export interface Application {
    use: (...args: any[]) => any;
    listen: (...args: any[]) => any;
    get: (...args: any[]) => any;
    post: (...args: any[]) => any;
  }

  type ExpressFunction = (() => Application) & { json: () => any };

  const express: ExpressFunction;

  export function Router(): Router;

  export default express;
}

declare module "cors" {
  type CorsMiddleware = (...args: any[]) => any;
  export default function cors(): CorsMiddleware;
}
