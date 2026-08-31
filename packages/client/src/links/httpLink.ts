import type { AnyClientTypes, AnyTRPCRouter } from '@trpc/server/unstable-core-do-not-import';
import type {
  HTTPLinkBaseOptions,
  Requester,
} from './internals/httpUtils';
import {
  getUrl,
  httpRequest,
  jsonHttpRequester,
  resolveHTTPLinkOptions,
} from './internals/httpUtils';
import {
  isFormData,
  isOctetType,
  type HTTPHeaders,
  type Operation,
  type TRPCLink,
} from './types';
import { createRequestResultObservable } from './internals/createRequestResult';

export type HTTPLinkOptions<TRoot extends AnyClientTypes> =
  HTTPLinkBaseOptions<TRoot> & {
    /**
     * Headers to be set on outgoing requests or a callback that of said headers
     * @see http://trpc.io/docs/client/headers
     */
    headers?:
      | HTTPHeaders
      | ((opts: { op: Operation }) => HTTPHeaders | Promise<HTTPHeaders>);
  };

const universalRequester: Requester = (opts) => {
  if ('input' in opts) {
    const { input } = opts;
    if (isFormData(input)) {
      if (opts.type !== 'mutation' && opts.methodOverride !== 'POST') {
        throw new Error('FormData is only supported for mutations');
      }

      return httpRequest({
        ...opts,
        // The browser will set this automatically and include the boundary= in it
        contentTypeHeader: undefined,
        getUrl,
        getBody: () => input,
      });
    }

    if (isOctetType(input)) {
      if (opts.type !== 'mutation' && opts.methodOverride !== 'POST') {
        throw new Error('Octet type input is only supported for mutations');
      }

      return httpRequest({
        ...opts,
        contentTypeHeader: 'application/octet-stream',
        getUrl,
        getBody: () => input,
      });
    }
  }

  return jsonHttpRequester(opts);
};

/**
 * @see https://trpc.io/docs/client/links/httpLink
 */
export function httpLink<TRouter extends AnyTRPCRouter = AnyTRPCRouter>(
  opts: HTTPLinkOptions<TRouter['_def']['_config']['$types']>,
): TRPCLink<TRouter> {
  const resolvedOpts = resolveHTTPLinkOptions(opts);
  return () => {
    return (operationOpts) => {
      const { op } = operationOpts;
      return createRequestResultObservable<unknown>({
        request: (async () => {
          const { path, input, type } = op;
          /* istanbul ignore if -- @preserve */
          if (type === 'subscription') {
            throw new Error(
              'Subscriptions are unsupported by `httpLink` - use `httpSubscriptionLink` or `wsLink`',
            );
          }
          return await universalRequester({
            ...resolvedOpts,
            type,
            path,
            input,
            signal: op.signal,
            headers() {
              if (!opts.headers) {
                return {};
              }
              if (typeof opts.headers === 'function') {
                return opts.headers({
                  op,
                });
              }
              return opts.headers;
            },
          });
        })(),
        transformerOutput: resolvedOpts.transformer.output,
      });
    };
  };
}
