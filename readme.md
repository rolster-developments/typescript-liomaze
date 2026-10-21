# Rolster Liomaze

Package that allows you to make http requests from the browser.

## Installation

```
npm i @rolster/liomaze
```

## Configuration

You must install the `@rolster/types` to define package data types, which are configured by adding them to the `files` property of the `tsconfig.json` file.

```json
{
  "files": ["node_modules/@rolster/types/index.d.ts"]
}
```

## HTTP methods

Liomaze exposes one standalone function per HTTP verb. Each one resolves
directly to the **response body** (already unwrapped from axios), typed with the
generic you pass:

```typescript
import { get, post, put, patch, destroy } from '@rolster/liomaze';

interface User {
  id: number;
  name: string;
}

// GET — typed response, optional query params
const user = await get<User>('https://api.rolster.com/users/1', {
  queryParams: { detailed: true }
});

// POST — send a body via `payload`
const created = await post<User>('https://api.rolster.com/users', {
  payload: { name: 'Daniel' }
});

await put('https://api.rolster.com/users/1', { payload: { name: 'Andrés' } });
await patch('https://api.rolster.com/users/1', { payload: { name: 'A.' } });
await destroy('https://api.rolster.com/users/1'); // DELETE
```

| Function   | Verb                          | Options type                       |
| ---------- | ----------------------------- | ---------------------------------- |
| `get`      | GET                           | no `payload`                       |
| `post`     | POST                          | full options (with `payload`)      |
| `put`      | PUT                           | full options                       |
| `patch`    | PATCH                         | full options                       |
| `destroy`  | DELETE                        | full options                       |
| `options`  | OPTIONS                       | full options                       |
| `file`     | POST (override with `method`) | no `queryParams`                   |
| `download` | GET (override with `method`)  | full options, resolves to a `Blob` |

> URLs are passed in full — Liomaze does not hold a base URL. The exported
> `delete` verb is named **`destroy`** (`delete` is a reserved word).

**Request options:** `headers`, `payload` (an `HttpPayload`: plain object,
array or any `BodyInit` such as `FormData`), `queryParams`, `retry` (an
`HttpRetry` or `false`), `signal` (an `AbortSignal`, see
[Cancellation](#cancellation)) and `withCredentials` (`get` omits `payload`).
The verbs are members of the `HttpMethod` enum (`HttpMethod.Get`,
`HttpMethod.Post`, ...).

### File upload

`file` sends a `FormData` instance (or any other `HttpPayload`) with `POST` by
default; pass `method` to use another verb:

```typescript
import { file, HttpMethod } from '@rolster/liomaze';

const form = new FormData();
form.append('avatar', input.files[0]);

const result = await file<{ url: string }>('https://api.rolster.com/upload', {
  payload: form
});

await file('https://api.rolster.com/users/1/avatar', {
  payload: form,
  method: HttpMethod.Put
});
```

### Download

`download` requests the URL with `responseType: 'blob'` and resolves to the
`Blob`. It uses `GET` by default and accepts the full request options plus
`method`:

```typescript
import { download } from '@rolster/liomaze';

const report = await download('https://api.rolster.com/reports/1', {
  queryParams: { format: 'pdf' }
});

const url = URL.createObjectURL(report);
```

## Global configuration

Use `config` to define cross-cutting behavior for every request. It performs a
partial merge, so each call only updates the properties you provide:
`catchError`, `headers`, `interceptors`, `responseType`, `retry` and
`withCredentials`.

```ts
import { config } from '@rolster/liomaze';

config({
  withCredentials: true, // send cookies/credentials on every request
  retry: { attempts: 3, delay: 1000 } // retry failed requests up to 3 times
});
```

### Response type

`responseType` is the axios `ResponseType` (`'json'`, `'text'`, `'blob'`,
`'arraybuffer'`, ...) applied to every request. It defaults to `'json'`;
`download` always uses `'blob'` regardless of this value:

```ts
config({ responseType: 'text' });
```

### Default headers

`headers` is a builder invoked before every request, so you can compute values
(such as an auth token) at send time. It may be async:

```ts
config({
  headers: async ({ header, method, url }) => {
    const token = await getAuthToken();
    header('Authorization', `Bearer ${token}`);
  }
});
```

### Interceptors

An `Interceptor` is a middleware `(request, next) => Promise<AxiosResponse>`.
It receives the `InterceptorRequest` about to be sent and an `InterceptorNext`
function; it must call `next(request)` to continue the chain and return its
result. You can mutate or replace the request before calling `next`, and
inspect or transform the axios response afterwards.

`InterceptorRequest` exposes `method` (`HttpMethod`), `url`, `headers`
(`Record<string, string>`) and the optional `data` (the `payload`), `params`
(the `queryParams`), `responseType`, `signal` and `withCredentials`.

Register them via `config({ interceptors: [...] })` (replaces the whole list)
or append one with `interceptor`. They run in registration order, on every
attempt when `retry` is enabled:

```ts
import { interceptor, Interceptor } from '@rolster/liomaze';

const requestId: Interceptor = (request, next) => {
  request.headers['X-Request-Id'] = crypto.randomUUID();

  return next(request);
};

const timing: Interceptor = async (request, next) => {
  const start = Date.now();
  const response = await next(request);

  console.log(`${request.method} ${request.url} took ${Date.now() - start}ms`);

  return response;
};

interceptor(requestId);
interceptor(timing);
```

### Retry

`retry` (an `HttpRetry`) reattempts a request when it fails with a network
error (no response) or an HTTP status `>= 500`; any other error is thrown
immediately. `attempts` is the number of extra tries after the initial one and
`delay` (optional, in milliseconds) is the **base** wait: attempt _n_ waits
`delay * 2^(n - 1)` plus a random jitter of up to 25% of that value. Without
`delay`, retries are immediate.

It can be overridden per request, or disabled with `false`:

```ts
// Override the global retry for this call
await get('/reports', { retry: { attempts: 5, delay: 500 } });

// Disable retry for this call
await post('/payments', { retry: false });
```

### withCredentials

Enabled globally with `config`, and overridable per request:

```ts
await get('/public', { withCredentials: false });
```

## Cancellation

Every request accepts a `signal` (a standard `AbortSignal`). Abort it to cancel
the request in flight: the underlying axios call is aborted, pending retries
are skipped (including a retry that is still waiting for its `delay`) and the
promise rejects with an `HttpCancelError`. If the signal is already aborted,
the request is never sent.

```ts
import { get, HttpCancelError } from '@rolster/liomaze';

const controller = new AbortController();

get('https://api.rolster.com/reports', { signal: controller.signal })
  .then((reports) => render(reports))
  .catch((error) => {
    if (error instanceof HttpCancelError) {
      return; // canceled on purpose, nothing to report
    }

    throw error;
  });

// Later, for example when the user navigates away
controller.abort();
```

`HttpCancelError` exposes `reason`, the value given to `abort(reason)` (by
default a `DOMException` named `AbortError`). Because it is a plain
`AbortSignal`, you can combine it with the platform helpers:

```ts
// Give up after 5 seconds
await get('/slow', { signal: AbortSignal.timeout(5000) });

// Cancel when either the user cancels or the timeout fires
await get('/slow', {
  signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)])
});
```

Cancellations go through `config({ catchError })` like any other error, so
check for `HttpCancelError` there if you report errors globally.

## Error handling

Failed HTTP responses are thrown as an `HttpError`, which exposes the status
code and the response body returned by the server:

```ts
import { get, HttpError } from '@rolster/liomaze';

try {
  await get('https://api.rolster.com/users/999');
} catch (error) {
  if (error instanceof HttpError) {
    console.error(error.statusCode); // e.g. 404
    console.error(error.response); // the server's error body
  }
}
```

You can transform every error globally with `config({ catchError })`.

## Types

| Type                 | Description                                                                       |
| -------------------- | --------------------------------------------------------------------------------- |
| `HttpMethod`         | Enum of verbs: `Get`, `Post`, `Put`, `Patch`, `Delete`, `Options`.                |
| `HttpPayload`        | Request body: plain object, `unknown[]` or `BodyInit` (e.g. `FormData`).          |
| `HttpRetry`          | `{ attempts: number; delay?: number }`.                                           |
| `Interceptor`        | `(request: InterceptorRequest, next: InterceptorNext) => Promise<AxiosResponse>`. |
| `InterceptorNext`    | `(request: InterceptorRequest) => Promise<AxiosResponse>`.                        |
| `InterceptorRequest` | The request handed to interceptors (see [Interceptors](#interceptors)).           |
| `HttpError<T>`       | Error class with `statusCode`, `message` and the server `response`.               |
| `HttpCancelError`    | Error thrown when the request is canceled through its `signal`; exposes `reason`. |

## Contributing

- Daniel Andrés Castillo Pedroza :rocket:
