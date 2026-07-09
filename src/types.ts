export enum HttpMethod {
  Post = 'POST',
  Get = 'GET',
  Put = 'PUT',
  Delete = 'DELETE',
  Patch = 'PATCH',
  Options = 'OPTIONS'
}

export type HttpPayload = LiteralObject | unknown[] | BodyInit;

export interface HttpRetry {
  attempts: number;
  delay?: number;
}
