import type { Request as ExpressRequest, Response as ExpressResponse } from "express";

export class WebhookAdapter {
  private static instance: WebhookAdapter;

  private constructor() {}

  static getInstance(): WebhookAdapter {
    if (!WebhookAdapter.instance) {
      WebhookAdapter.instance = new WebhookAdapter();
    }
    return WebhookAdapter.instance;
  }

  private buildHeaders(reqHeaders: Record<string, string | string[] | undefined>): Headers {
    const headers = new Headers();
    for (const [key, value] of Object.entries(reqHeaders)) {
      if (typeof value === "string") {
        headers.set(key, value);
      } else if (Array.isArray(value)) {
        for (const v of value) {
          headers.append(key, v);
        }
      }
    }
    return headers;
  }

  private async writeResponse(res: ExpressResponse, fetchResponse: Response): Promise<void> {
    res.status(fetchResponse.status);
    fetchResponse.headers.forEach((value: string, key: string) => {
      res.setHeader(key, value);
    });
    const body = await fetchResponse.text();
    res.send(body);
  }

  /**
   * Converts an Express request/response pair into a Web API Request,
   * dispatches it to the given handler, and writes the result back to the
   * Express response.
   *
   * This is a pure HTTP adapter — it has no knowledge of any specific service.
   */
  async dispatch(
    req: ExpressRequest,
    res: ExpressResponse,
    handler: (request: Request) => Promise<Response>,
  ): Promise<void> {
    const rawBody = (req as ExpressRequest & { rawBody?: Buffer }).rawBody;
    const host = req.headers.host ?? "localhost";
    const url = `https://${host}${req.url}`;
    const headers = this.buildHeaders(req.headers);

    const fetchRequest = new Request(url, {
      method: req.method,
      headers,
      body: rawBody ? new Uint8Array(rawBody) : null,
    });

    const fetchResponse = await handler(fetchRequest);
    await this.writeResponse(res, fetchResponse);
  }
}

export const webhookAdapter = WebhookAdapter.getInstance();
