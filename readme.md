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

## Contributing

- Daniel Andrés Castillo Pedroza :rocket:
