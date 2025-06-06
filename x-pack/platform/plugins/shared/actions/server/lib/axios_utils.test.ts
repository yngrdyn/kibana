/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AxiosInstance } from 'axios';
import axios, { AxiosError } from 'axios';
import { Agent as HttpsAgent } from 'https';
import HttpProxyAgent from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { Logger } from '@kbn/core/server';
import {
  addTimeZoneToDate,
  request,
  patch,
  getErrorMessage,
  throwIfResponseIsNotValid,
  createAxiosResponse,
} from './axios_utils';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import { actionsConfigMock } from '../actions_config.mock';
import { getCustomAgents } from './get_custom_agents';
import { ConnectorUsageCollector } from '../usage/connector_usage_collector';

const TestUrl = 'https://elastic.co/foo/bar/baz';

const logger = loggingSystemMock.create().get() as jest.Mocked<Logger>;
let configurationUtilities = actionsConfigMock.create();
jest.mock('axios');
const axiosMock = axios as unknown as jest.Mock;

describe('addTimeZoneToDate', () => {
  test('adds timezone with default', () => {
    const date = addTimeZoneToDate('2020-04-14T15:01:55.456Z');
    expect(date).toBe('2020-04-14T15:01:55.456Z GMT');
  });

  test('adds timezone correctly', () => {
    const date = addTimeZoneToDate('2020-04-14T15:01:55.456Z', 'PST');
    expect(date).toBe('2020-04-14T15:01:55.456Z PST');
  });
});

describe('request', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    axiosMock.mockImplementation(() => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: { incidentId: '123' },
    }));
    configurationUtilities = actionsConfigMock.create();
    configurationUtilities.getResponseSettings.mockReturnValue({
      maxContentLength: 1000000,
      timeout: 360000,
    });
  });

  test('it fetch correctly with defaults', async () => {
    const res = await request({
      axios,
      url: '/test',
      logger,
      configurationUtilities,
    });

    expect(axiosMock).toHaveBeenCalledWith('/test', {
      method: 'get',
      httpAgent: undefined,
      httpsAgent: expect.any(HttpsAgent),
      proxy: false,
      maxContentLength: 1000000,
      timeout: 360000,
    });
    expect(res).toEqual({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: { incidentId: '123' },
    });
  });

  test('adds request body bytes from request header on a successful request when connectorUsageCollector is provided', async () => {
    const contentLength = 12;
    axiosMock.mockImplementation(() => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: { incidentId: '123' },
      request: {
        headers: { 'Content-Length': contentLength },
        getHeader: () => contentLength,
      },
    }));
    const connectorUsageCollector = new ConnectorUsageCollector({
      logger,
      connectorId: 'test-connector-id',
    });
    await request({
      axios,
      url: '/test',
      logger,
      data: { test: 12345 },
      configurationUtilities,
      connectorUsageCollector,
    });

    expect(connectorUsageCollector.getRequestBodyByte()).toBe(contentLength);
  });

  test('adds request body bytes from request header on a failed', async () => {
    const contentLength = 12;
    axiosMock.mockImplementation(
      () =>
        new AxiosError('failed', '500', undefined, {
          headers: { 'Content-Length': contentLength },
        })
    );
    const connectorUsageCollector = new ConnectorUsageCollector({
      logger,
      connectorId: 'test-connector-id',
    });

    try {
      await request({
        axios,
        url: '/test',
        logger,
        configurationUtilities,
        connectorUsageCollector,
      });
    } catch (e) {
      expect(connectorUsageCollector.getRequestBodyByte()).toBe(contentLength);
    }
  });

  test('adds request body bytes from data when request header does not exist', async () => {
    const connectorUsageCollector = new ConnectorUsageCollector({
      logger,
      connectorId: 'test-connector-id',
    });
    const data = { test: 12345 };

    await request({
      axios,
      url: '/test',
      logger,
      data,
      configurationUtilities,
      connectorUsageCollector,
    });

    expect(connectorUsageCollector.getRequestBodyByte()).toBe(
      Buffer.byteLength(JSON.stringify(data), 'utf8')
    );
  });

  test('it have been called with proper proxy agent for a valid url', async () => {
    configurationUtilities.getProxySettings.mockReturnValue({
      proxySSLSettings: {
        verificationMode: 'full',
      },
      proxyUrl: 'https://localhost:1212',
      proxyBypassHosts: undefined,
      proxyOnlyHosts: undefined,
    });
    const { httpAgent, httpsAgent } = getCustomAgents(configurationUtilities, logger, TestUrl);

    const res = await request({
      axios,
      url: TestUrl,
      logger,
      configurationUtilities,
    });

    expect(axiosMock).toHaveBeenCalledWith(TestUrl, {
      method: 'get',
      httpAgent,
      httpsAgent,
      proxy: false,
      maxContentLength: 1000000,
      timeout: 360000,
    });
    expect(res).toEqual({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: { incidentId: '123' },
    });
  });

  test('it have been called with proper proxy agent for an invalid url', async () => {
    configurationUtilities.getProxySettings.mockReturnValue({
      proxyUrl: ':nope:',
      proxySSLSettings: {
        verificationMode: 'none',
      },
      proxyBypassHosts: undefined,
      proxyOnlyHosts: undefined,
    });
    const res = await request({
      axios,
      url: 'https://testProxy',
      logger,
      configurationUtilities,
    });

    expect(axiosMock).toHaveBeenCalledWith('https://testProxy', {
      method: 'get',
      httpAgent: undefined,
      httpsAgent: expect.any(HttpsAgent),
      proxy: false,
      maxContentLength: 1000000,
      timeout: 360000,
    });
    expect(res).toEqual({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: { incidentId: '123' },
    });
  });

  test('it bypasses with proxyBypassHosts when expected', async () => {
    configurationUtilities.getProxySettings.mockReturnValue({
      proxySSLSettings: {
        verificationMode: 'full',
      },
      proxyUrl: 'https://elastic.proxy.co',
      proxyBypassHosts: new Set(['elastic.co']),
      proxyOnlyHosts: undefined,
    });

    await request({
      axios,
      url: TestUrl,
      logger,
      configurationUtilities,
    });

    expect(axiosMock.mock.calls.length).toBe(1);
    const { httpAgent, httpsAgent } = axiosMock.mock.calls[0][1];
    expect(httpAgent instanceof HttpProxyAgent).toBe(false);
    expect(httpsAgent instanceof HttpsProxyAgent).toBe(false);
  });

  test('it does not bypass with proxyBypassHosts when expected', async () => {
    configurationUtilities.getProxySettings.mockReturnValue({
      proxySSLSettings: {
        verificationMode: 'full',
      },
      proxyUrl: 'https://elastic.proxy.co',
      proxyBypassHosts: new Set(['not-elastic.co']),
      proxyOnlyHosts: undefined,
    });

    await request({
      axios,
      url: TestUrl,
      logger,
      configurationUtilities,
    });

    expect(axiosMock.mock.calls.length).toBe(1);
    const { httpAgent, httpsAgent } = axiosMock.mock.calls[0][1];
    expect(httpAgent instanceof HttpProxyAgent).toBe(true);
    expect(httpsAgent instanceof HttpsProxyAgent).toBe(true);
  });

  test('it proxies with proxyOnlyHosts when expected', async () => {
    configurationUtilities.getProxySettings.mockReturnValue({
      proxySSLSettings: {
        verificationMode: 'full',
      },
      proxyUrl: 'https://elastic.proxy.co',
      proxyBypassHosts: undefined,
      proxyOnlyHosts: new Set(['elastic.co']),
    });

    await request({
      axios,
      url: TestUrl,
      logger,
      configurationUtilities,
    });

    expect(axiosMock.mock.calls.length).toBe(1);
    const { httpAgent, httpsAgent } = axiosMock.mock.calls[0][1];
    expect(httpAgent instanceof HttpProxyAgent).toBe(true);
    expect(httpsAgent instanceof HttpsProxyAgent).toBe(true);
  });

  test('it does not proxy with proxyOnlyHosts when expected', async () => {
    configurationUtilities.getProxySettings.mockReturnValue({
      proxySSLSettings: {
        verificationMode: 'full',
      },
      proxyUrl: 'https://elastic.proxy.co',
      proxyBypassHosts: undefined,
      proxyOnlyHosts: new Set(['not-elastic.co']),
    });

    await request({
      axios,
      url: TestUrl,
      logger,
      configurationUtilities,
    });

    expect(axiosMock.mock.calls.length).toBe(1);
    const { httpAgent, httpsAgent } = axiosMock.mock.calls[0][1];
    expect(httpAgent instanceof HttpProxyAgent).toBe(false);
    expect(httpsAgent instanceof HttpsProxyAgent).toBe(false);
  });

  test('it fetch correctly', async () => {
    const res = await request({
      axios,
      url: '/test',
      method: 'post',
      logger,
      data: { id: '123' },
      configurationUtilities,
    });

    expect(axiosMock).toHaveBeenCalledWith('/test', {
      method: 'post',
      data: { id: '123' },
      httpAgent: undefined,
      httpsAgent: expect.any(HttpsAgent),
      proxy: false,
      maxContentLength: 1000000,
      timeout: 360000,
    });
    expect(res).toEqual({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: { incidentId: '123' },
    });
  });

  test('it uses timeout argument when one is provided', async () => {
    configurationUtilities.getProxySettings.mockReturnValue({
      proxySSLSettings: {
        verificationMode: 'full',
      },
      proxyUrl: 'https://elastic.proxy.co',
      proxyBypassHosts: new Set(['elastic.co']),
      proxyOnlyHosts: undefined,
    });

    await request({
      axios,
      url: TestUrl,
      logger,
      configurationUtilities,
    });

    await request({
      axios,
      url: TestUrl,
      logger,
      configurationUtilities,
      timeout: 55,
    });

    expect(axiosMock.mock.calls.length).toBe(2);
    expect(axiosMock.mock.calls[0][1].timeout).toBe(360000);
    expect(axiosMock.mock.calls[1][1].timeout).toBe(360000);
  });

  test('it uses timeout argument when one is provided that is greater than settings timeout', async () => {
    configurationUtilities.getProxySettings.mockReturnValue({
      proxySSLSettings: {
        verificationMode: 'full',
      },
      proxyUrl: 'https://elastic.proxy.co',
      proxyBypassHosts: new Set(['elastic.co']),
      proxyOnlyHosts: undefined,
    });

    await request({
      axios,
      url: TestUrl,
      logger,
      configurationUtilities,
    });

    await request({
      axios,
      url: TestUrl,
      logger,
      configurationUtilities,
      timeout: 360001,
    });

    expect(axiosMock.mock.calls.length).toBe(2);
    expect(axiosMock.mock.calls[0][1].timeout).toBe(360000);
    expect(axiosMock.mock.calls[1][1].timeout).toBe(360001);
  });

  test('throw an error if you use  baseUrl in your axios instance', async () => {
    await expect(async () => {
      await request({
        axios: {
          ...axios,
          defaults: {
            ...axios.defaults,
            baseURL: 'https://here-we-go.com',
            allowAbsoluteUrls: false,
          },
        } as unknown as AxiosInstance,
        url: '/test',
        logger,
        configurationUtilities,
      });
    }).rejects.toThrowErrorMatchingInlineSnapshot(
      `"Do not use \\"baseURL\\" in the creation of your axios instance because you will mostly break proxy"`
    );
  });

  test('it converts the auth property to basic auth header', async () => {
    await request({
      axios,
      url: '/test',
      logger,
      configurationUtilities,
      auth: { username: 'username', password: 'password' },
    });

    expect(axiosMock).toHaveBeenCalledWith('/test', {
      method: 'get',
      httpAgent: undefined,
      httpsAgent: expect.any(HttpsAgent),
      proxy: false,
      maxContentLength: 1000000,
      timeout: 360000,
      headers: { Authorization: `Basic ${Buffer.from('username:password').toString('base64')}` },
    });
  });

  test('it does not override an authorization header if provided', async () => {
    await request({
      axios,
      url: '/test',
      logger,
      configurationUtilities,
      auth: { username: 'username', password: 'password' },
      headers: {
        'Content-Type': 'application/json',
        'X-Test-Header': 'test',
        Authorization: 'Bearer my_token',
      },
    });

    expect(axiosMock).toHaveBeenCalledWith('/test', {
      method: 'get',
      httpAgent: undefined,
      httpsAgent: expect.any(HttpsAgent),
      proxy: false,
      maxContentLength: 1000000,
      timeout: 360000,
      headers: {
        'Content-Type': 'application/json',
        'X-Test-Header': 'test',
        Authorization: 'Bearer my_token',
      },
    });
  });
});

describe('patch', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    axiosMock.mockImplementation(() => ({
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    configurationUtilities = actionsConfigMock.create();
    configurationUtilities.getResponseSettings.mockReturnValue({
      maxContentLength: 1000000,
      timeout: 360000,
    });
  });

  test('it fetch correctly', async () => {
    await patch({ axios, url: '/test', data: { id: '123' }, logger, configurationUtilities });
    expect(axiosMock).toHaveBeenCalledWith('/test', {
      method: 'patch',
      data: { id: '123' },
      httpAgent: undefined,
      httpsAgent: expect.any(HttpsAgent),
      proxy: false,
      maxContentLength: 1000000,
      timeout: 360000,
    });
  });
});

describe('getErrorMessage', () => {
  test('it returns the correct error message', () => {
    const msg = getErrorMessage('My connector name', 'An error has occurred');
    expect(msg).toBe('[Action][My connector name]: An error has occurred');
  });
});

describe('throwIfResponseIsNotValid', () => {
  const res = createAxiosResponse({
    headers: { ['content-type']: 'application/json' },
    data: { incident: { id: '1' } },
  });

  test('it does NOT throw if the request is valid', () => {
    expect(() => throwIfResponseIsNotValid({ res })).not.toThrow();
  });

  test('it does throw if the content-type is not json', () => {
    expect(() =>
      throwIfResponseIsNotValid({
        res: { ...res, headers: { ['content-type']: 'text/html' } },
      })
    ).toThrow(
      'Unsupported content type: text/html in GET https://example.com. Supported content types: application/json'
    );
  });

  test('it does throw if the content-type is undefined', () => {
    expect(() =>
      throwIfResponseIsNotValid({
        res: { ...res, headers: {} },
      })
    ).toThrow(
      'Unsupported content type: undefined in GET https://example.com. Supported content types: application/json'
    );
  });

  test('it does throw if the data is not an object or array', () => {
    expect(() =>
      throwIfResponseIsNotValid({
        res: { ...res, data: 'string' },
      })
    ).toThrow('Response is not a valid JSON');
  });

  test('it does NOT throw if the data is an array', () => {
    expect(() =>
      throwIfResponseIsNotValid({
        res: { ...res, data: ['test'] },
      })
    ).not.toThrow();
  });

  test.each(['', [], {}])('it does NOT throw if the data is %p', (data) => {
    expect(() =>
      throwIfResponseIsNotValid({
        res: { ...res, data },
      })
    ).not.toThrow();
  });

  test('it does throw if the required attribute is not in the response', () => {
    expect(() =>
      throwIfResponseIsNotValid({ res, requiredAttributesToBeInTheResponse: ['not-exist'] })
    ).toThrow('Response is missing at least one of the expected fields: not-exist');
  });

  test('it does throw if the required attribute are defined and the data is an array', () => {
    expect(() =>
      throwIfResponseIsNotValid({
        res: { ...res, data: ['test'] },
        requiredAttributesToBeInTheResponse: ['not-exist'],
      })
    ).toThrow('Response is missing at least one of the expected fields: not-exist');
  });

  test('it does NOT throw if the value of the required attribute is null', () => {
    expect(() =>
      throwIfResponseIsNotValid({
        res: { ...res, data: { id: null } },
        requiredAttributesToBeInTheResponse: ['id'],
      })
    ).not.toThrow();
  });

  test('it does NOT throw if HTTP status code is 204 even if the content type is not supported', () => {
    expect(() =>
      throwIfResponseIsNotValid({
        res: { ...res, status: 204, headers: { ['content-type']: 'text/html' } },
      })
    ).not.toThrow();
  });
});
