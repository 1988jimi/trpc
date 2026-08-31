import type { APIGatewayProxyEvent } from 'aws-lambda';
import { expect, test } from 'vitest';
import { getPlanner } from './getPlanner';

test('v1 preserves multiValueQueryStringParameters', () => {
  const event = {
    version: '1.0',
    path: '/test',
    httpMethod: 'GET',
    headers: {},
    pathParameters: {},
    requestContext: {
      domainName: 'example.com',
    },
    queryStringParameters: { first: 'one' },
    multiValueQueryStringParameters: {
      first: ['one', 'two'],
      second: ['three'],
    },
  } satisfies APIGatewayProxyEvent;

  const planner = getPlanner(event);
  const req = planner.request;
  const url = new URL(req.url);

  expect(url.pathname).toBe('/test');
  expect(url.searchParams.getAll('first')).toEqual(['one', 'two']);
  expect(url.searchParams.getAll('second')).toEqual(['three']);
});
