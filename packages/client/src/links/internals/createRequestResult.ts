import { observable } from '@trpc/server/observable';
import type { TRPCResponse } from '@trpc/server/rpc';
import type { AnyTRPCRouter } from '@trpc/server/unstable-core-do-not-import';
import { TRPCClientError } from '../../TRPCClientError';
import type { CombinedDataTransformer } from '@trpc/server/unstable-core-do-not-import';
import { transformResult } from '@trpc/server/unstable-core-do-not-import';

type RequestMeta = {
  response: unknown;
  responseJSON?: unknown;
};

type HTTPResult = {
  json: TRPCResponse<unknown, unknown>;
  meta: RequestMeta;
};

type HandlerOptions<TOutput> = {
  request: Promise<HTTPResult>;
  transformerOutput: CombinedDataTransformer['output'];
};

export function createRequestResultObservable<
  TOutput,
>(opts: HandlerOptions<TOutput>) {
  return observable<{
    result: {
      data: TOutput;
    };
    context?: Record<string, unknown>;
  }, TRPCClientError<AnyTRPCRouter>>((observer) => {
    let meta: RequestMeta | undefined;

    opts.request
      .then((res) => {
        meta = res.meta;
        const transformed = transformResult(
          res.json,
          opts.transformerOutput,
        );

        if (!transformed.ok) {
          observer.error(
            TRPCClientError.from(transformed.error, {
              meta,
            }),
          );
          return;
        }

        observer.next({
          context: res.meta,
          result: transformed.result,
        });
        observer.complete();
      })
      .catch((cause) => {
        observer.error(
          TRPCClientError.from(cause, {
            meta,
          }),
        );
      });

    return () => {
      // no-op
    };
  });
}
