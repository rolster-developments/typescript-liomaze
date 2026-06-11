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

| Function     | Verb    | Options type                       |
| ------------ | ------- | ---------------------------------- |
| `get`        | GET     | no `payload`                       |
| `post`       | POST    | full options (with `payload`)      |
| `put`        | PUT     | full options                       |
| `patch`      | PATCH   | full options                       |
| `destroy`    | DELETE  | full options                       |
| `options`    | OPTIONS | full options                       |
| `file`       | POST    | `payload` is a `FormData`          |

> URLs are passed in full — Liomaze does not hold a base URL. The exported
> `delete` verb is named **`destroy`** (`delete` is a reserved word).

**Request options:** `headers`, `payload`, `queryParams`, `retry`,
`withCredentials` (`get` omits `payload`).

### File upload

`file` sends `multipart/form-data` from a `FormData` instance:

```typescript
import { file } from '@rolster/liomaze';

const form = new FormData();
form.append('avatar', input.files[0]);

const result = await file<{ url: string }>('https://api.rolster.com/upload', {
  payload: form
});
```

## Global configuration

Use `config` to define cross-cutting behavior for every request. It performs a
partial merge, so each call only updates the properties you provide.

```ts
import { config } from '@rolster/liomaze';

config({
  withCredentials: true, // send cookies/credentials on every request
  retry: { attempts: 3, delay: 1000 } // retry failed requests 3 times, waiting 1s
});
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

Interceptors can add headers or merge into the payload of every request. Register
them via `config({ interceptors: [...] })` or append one with `interceptor`:

```ts
import { interceptor } from '@rolster/liomaze';

interceptor(({ interceptor: request, method, url }) => {
  request.header('X-Request-Id', crypto.randomUUID());
});
```

### Retry

`retry` reattempts a request when it fails. `attempts` is the number of extra
tries after the initial one and `delay` (optional, in milliseconds) is the wait
between attempts.

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

## Contributing

- Daniel Andrés Castillo Pedroza :rocket:
