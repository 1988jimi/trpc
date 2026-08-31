import type { AnyRouter, ProcedureType } from '@trpc/server';
import type { BatchLoader } from '../internals/dataLoader';
import { dataLoader } from '../internals/dataLoader';
import { allAbortSignals } from '../internals/signals';
import type { NonEmptyArray } from '../internals/types';
import type { HTTPBatchLinkOptions } from './HTTPBatchLinkOptions';
import type { HTTPResult } from './internals/httpUtils';
import {
  getUrl,
  jsonHttpRequester,
  resolveHTTPLinkOptions,
} from './internals/httpUtils';
import type { Operation, TRPCLink } from './types';
import { createRequestResultObservable } from './internals/createRequestResult';
import { TRPCError } from '@trpc/server';

/**
 * @see https://trpc.io/docs/client/links/httpBatchLink
 */
export function httpBatchLink<TRouter extends AnyRouter>(
  opts: HTTPBatchLinkOptions<TRouter['_def']['_config']['$types']>,
): TRPCLink<TRouter> {
  const resolvedOpts = resolveHTTPLinkOptions(opts);
  const maxURLLength = opts.maxURLLength ?? Infinity;
  const maxItems = opts.maxItems ?? Infinity;

  return () => {
    const batchLoader = (
      type: ProcedureType,
    ): BatchLoader<Operation, HTTPResult> => {
      return {
        validate(batchOps) {
          if (maxURLLength === Infinity && maxItems === Infinity) {
            // escape hatch for quick calcs
            return true;
          }
          if (batchOps.length > maxItems) {
            return false;
          }
          const path = batchOps.map((op) => op.path).join(',');
          const inputs = batchOps.map((op) => op.input);

          const url = getUrl({
            ...resolvedOpts,
            type,
            path,
            inputs,
            signal: null,
          });

          return url.length <= maxURLLength;
        },
        async fetch(batchOps) {
          const path = batchOps.map((op) => op.path).join(',');
          const inputs = batchOps.map((op) => op.input);
          const signal = allAbortSignals(...batchOps.map((op) => op.signal));

          const res = await jsonHttpRequester({
            ...resolvedOpts,
            path,
            inputs,
            type,
            headers() {
              if (!opts.headers) {
                return {};
              }
              if (typeof opts.headers === 'function') {
                return opts.headers({
                  opList: batchOps as NonEmptyArray<Operation>,
                });
              }
              return opts.headers;
            },
            signal,
          });
          const resJSON = Array.isArray(res.json)
            ? res.json
            : batchOps.map(() => res.json);
          if (Array.isArray(res.json) && resJSON.length !== batchOps.length) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Batch response size mismatch',
            });
          }
          const result = resJSON.map((item) => ({
            meta: res.meta,
            json: item,
          }));
          return result;
        },
      };
    };

    const query = dataLoader(batchLoader('query'));
    const mutation = dataLoader(batchLoader('mutation'));

    const loaders = { query, mutation };
    return ({ op }) => {
      /* istanbul ignore if -- @preserve */
      if (op.type === 'subscription') {
        throw new Error(
          'Subscriptions are unsupported by `httpBatchLink` - use `httpSubscriptionLink` or `wsLink`',
        );
      }

      return createRequestResultObservable<unknown>({
        request: loaders[op.type].load(op),
        transformerOutput: resolvedOpts.transformer.output,
      });
    };
  };
}
