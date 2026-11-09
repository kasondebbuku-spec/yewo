import { API_URL } from './config';

let token: string | null = null;
export const setApiToken = (t: string | null) => {
  token = t;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Options = { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown };

export async function api<T = any>(path: string, { method = 'GET', body }: Options = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach Yewo right now. Check your internet connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'Something went wrong');
  return data as T;
}

// Multipart upload (photos). The browser/phone sets the content-type with the boundary itself.
export async function apiUpload<T = any>(path: string, form: FormData, method: 'PUT' | 'POST' = 'PUT'): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: form,
    });
  } catch {
    throw new ApiError(0, "Can't reach Yewo right now. Check your internet connection.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'Upload failed');
  return data as T;
}

export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong';
