import { authFetch } from "./auth";
import { ApiResult } from "./types";

export class ApiError extends Error {}

const inFlightGetRequests = new Map<string, Promise<unknown>>();

async function executeRequest<T>(url: string, options: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await authFetch(url, options);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Unable to reach Rainfrog. Check your connection and try again.");
  }

  let body: ApiResult<T>;
  try {
    body = await response.json();
  } catch {
    throw new ApiError("The server returned an unreadable response.");
  }
  if (body.status !== 1 || body.data === undefined) {
    throw new ApiError(body.error ?? "Something went wrong. Please try again.");
  }
  return body.data;
}

export function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  if (method !== "GET") return executeRequest<T>(url, options);

  const existing = inFlightGetRequests.get(url);
  if (existing) return existing as Promise<T>;
  const request = executeRequest<T>(url, options).finally(() => {
    if (inFlightGetRequests.get(url) === request) inFlightGetRequests.delete(url);
  });
  inFlightGetRequests.set(url, request);
  return request;
}

export async function apiAction(url: string, options: RequestInit = {}): Promise<void> {
  const response = await authFetch(url, options);
  const body = await response.json() as ApiResult<unknown>;
  if (body.status !== 1) throw new ApiError(body.error ?? "Something went wrong. Please try again.");
}
