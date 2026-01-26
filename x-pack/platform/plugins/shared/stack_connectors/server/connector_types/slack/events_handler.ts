/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type {
  IRouter,
  RequestHandlerContext,
  KibanaRequest,
  IKibanaResponse,
  KibanaResponseFactory,
  FakeRawRequest,
} from '@kbn/core/server';
import type { StartServicesAccessor } from '@kbn/core/server';
import { ACTION_SAVED_OBJECT_TYPE } from '@kbn/actions-plugin/server';
import { isBoom } from '@hapi/boom';
import { kibanaRequestFactory } from '@kbn/core-http-server-utils';
import { verifySlackSignature } from './signature_verification';
import type { ConnectorsPluginsStart } from '../../plugin';
import type { Logger } from '@kbn/core/server';
import { getConnectorApiKeyForExternalEvents } from '../../lib/external_events_api_key';

interface SlackConnectorSecrets {
  webhookUrl?: string;
  signingSecret?: string; // Optional: for Events API signature verification
}

interface SlackEventPayload {
  token?: string;
  team_id?: string;
  api_app_id?: string;
  event?: {
    type: string;
    channel?: string;
    text?: string;
    user?: string;
    ts?: string;
    [key: string]: any;
  };
  type?: string;
  challenge?: string; // URL verification challenge
  [key: string]: any;
}

/**
 * Normalizes a Slack Events API payload to the platform event format.
 */
function normalizeSlackEvent(slackEvent: SlackEventPayload): {
  source: string;
  type: string;
  payload: Record<string, any>;
} {
  // Handle URL verification challenge (Slack Events API requirement)
  if (slackEvent.type === 'url_verification' && slackEvent.challenge) {
    // Return a special format that the handler can recognize
    return {
      source: 'slack',
      type: 'url_verification',
      payload: {
        challenge: slackEvent.challenge,
      },
    };
  }

  // Handle event callbacks
  if (slackEvent.event) {
    const event = slackEvent.event;
    const eventType = event.type;

    // Map Slack event types to platform event types
    let platformEventType = `slack.${eventType}`;
    
    // Special handling for message events
    if (eventType === 'message') {
      platformEventType = 'message.posted';
    }

    return {
      source: 'slack',
      type: platformEventType,
      payload: {
        channel: event.channel,
        text: event.text,
        user: event.user,
        ts: event.ts,
        team_id: slackEvent.team_id,
        api_app_id: slackEvent.api_app_id,
        // Include all other event properties
        ...Object.fromEntries(
          Object.entries(event).filter(([key]) => 
            !['channel', 'text', 'user', 'ts'].includes(key)
          )
        ),
      },
    };
  }

  // Fallback for unknown event types
  return {
    source: 'slack',
    type: 'unknown',
    payload: slackEvent,
  };
}

/**
 * Creates a request with connector-scoped identity for event emission.
 * 
 * This request represents events from an external system (Slack) via a connector.
 * The identity is connector-scoped, meaning events are associated with the connector
 * that received them. We use the incoming request's authentication context if available,
 * which represents the connector's authentication scope in Kibana.
 * 
 * The request will result in:
 * - principalId: Based on the incoming request's authentication (or 'system' if not available)
 * - credentialType: Based on the incoming request's credentials (or 'service' if not available)
 * - spaceId: The connector's space
 */
function createConnectorScopedRequest(
  connectorId: string,
  spaceId: string,
  incomingRequest?: KibanaRequest
): KibanaRequest {
  const headers: FakeRawRequest['headers'] = {
    'kbn-system-request': 'true',
    'x-elastic-internal-origin': 'Kibana',
    'x-slack-connector-id': connectorId,
    'x-slack-space-id': spaceId,
  };

  // If the incoming request has authentication (authorization header), preserve it
  // This allows emitEvent to use the connector's authentication scope
  if (incomingRequest?.headers?.authorization) {
    const authHeader = incomingRequest.headers.authorization;
    headers.authorization = Array.isArray(authHeader) ? authHeader[0] : String(authHeader);
  }

  // Create a fake request with connector-scoped identity
  // Preserve authentication from incoming request if available
  const fakeRawRequest: FakeRawRequest = {
    headers,
    path: '/',
    auth: incomingRequest?.auth || {
      isAuthenticated: false,
    },
  };

  const request = kibanaRequestFactory(fakeRawRequest);
  
  return request;
}

/**
 * Creates a request with connector-scoped identity and an API key for event emission.
 * 
 * This is used when we've created an API key internally for the event.
 * The API key is included in the authorization header so emitEvent can extract and store it.
 */
function createConnectorScopedRequestWithApiKey(
  connectorId: string,
  spaceId: string,
  apiKey: { id: string; api_key: string }
): KibanaRequest {
  // Encode the API key in the format expected by Elasticsearch
  const encoded = Buffer.from(`${apiKey.id}:${apiKey.api_key}`).toString('base64');
  
  const headers: FakeRawRequest['headers'] = {
    'kbn-system-request': 'true',
    'x-elastic-internal-origin': 'Kibana',
    'x-slack-connector-id': connectorId,
    'x-slack-space-id': spaceId,
    authorization: `ApiKey ${encoded}`, // Include API key for emitEvent to extract
  };

  const fakeRawRequest: FakeRawRequest = {
    headers,
    path: '/',
    auth: {
      isAuthenticated: true, // Mark as authenticated since we have an API key
    },
  };

  const request = kibanaRequestFactory(fakeRawRequest);
  
  return request;
}

export const registerSlackEventsRoute = (
  router: IRouter,
  getStartServices: StartServicesAccessor<ConnectorsPluginsStart, unknown>,
  logger: Logger
) => {
  router.post(
    {
      path: '/api/actions/connector/slack/events',
      security: {
        authz: {
          enabled: false,
          reason:
            'This route handles Slack Events API webhooks and uses signature verification for authentication.',
        },
        authc: {
          enabled: false,
          reason:
            'This route handles Slack Events API webhooks. Slack cannot send custom headers, so authentication is handled via signature verification and API keys are created internally.',
        },
      },
      validate: {
        query: schema.object({
          connectorId: schema.string(),
        }),
        body: schema.any(), // Slack Events API payload structure varies
      },
      options: {
        access: 'public', // Must be public for Slack webhooks (Slack cannot send API keys)
        xsrfRequired: false, // Disable XSRF protection for external webhooks
        body: {
          output: 'data', // Get raw body for signature verification
        },
        tags: ['api'], // API tag for proper handling
      },
    },
    async (
      ctx: RequestHandlerContext,
      req: KibanaRequest<unknown, { connectorId: string }, SlackEventPayload>,
      res: KibanaResponseFactory
    ): Promise<IKibanaResponse> => {
      // Use the plugin logger for this route
      const ctxLogger = logger.get('slack-events');
      
      try {
        const { connectorId } = req.query;
        const slackEvent = req.body;
        
        // Debug logging - log at INFO level so it's always visible
        ctxLogger.info(`[INCOMING] Received Slack webhook request for connector: ${connectorId}`);
        ctxLogger.info(`[INCOMING] Full Slack event payload: ${JSON.stringify(slackEvent, null, 2)}`);
        ctxLogger.info(`[INCOMING] Event top-level type: ${slackEvent?.type || 'undefined'}`);
        ctxLogger.info(`[INCOMING] Event has 'event' field: ${!!slackEvent?.event}`);
        if (slackEvent?.event) {
          ctxLogger.info(`[INCOMING] Event.event.type: ${slackEvent.event.type}`);
        }

        // Handle URL verification challenge FIRST (before any other processing)
        // This is critical - Slack sends this when configuring the Request URL
        // and it must be handled immediately without requiring connector lookup
        if (slackEvent?.type === 'url_verification' && slackEvent?.challenge) {
          ctxLogger.info(`Handling URL verification challenge: ${slackEvent.challenge}`);
          // Slack expects JSON response: { "challenge": "<challenge-value>" }
          return res.ok({
            body: {
              challenge: slackEvent.challenge,
            },
          });
        }

        ctxLogger.info(`[STEP] Getting services...`);
        const [core, { encryptedSavedObjects, spaces, workflowsExtensions }] =
          await getStartServices();

        if (!workflowsExtensions) {
          ctxLogger.error(`[ERROR] Workflows extensions service not available`);
          return res.customError({
            statusCode: 503,
            body: {
              message: 'Workflows extensions service not available',
            },
          });
        }
        ctxLogger.info(`[STEP] Workflows extensions service available`);

        // Get connector using internal saved objects client (no auth required)
        ctxLogger.info(`[STEP] Getting connector ${connectorId} using internal client...`);
        const spaceId = spaces.spacesService.getSpaceId(req);
        const internalSavedObjectsClient = core.savedObjects.createInternalRepository([
          ACTION_SAVED_OBJECT_TYPE,
        ]);

        let connector;
        let connectorCreatedBy: string | undefined;
        try {
          const connectorResult = await internalSavedObjectsClient.get<{
            actionTypeId: string;
            name: string;
            config?: Record<string, unknown>;
            secrets?: Record<string, unknown>;
          }>(
            ACTION_SAVED_OBJECT_TYPE,
            connectorId,
            spaceId !== 'default' ? { namespace: spaceId } : {}
          );
          connector = {
            id: connectorResult.id,
            actionTypeId: connectorResult.attributes.actionTypeId,
            name: connectorResult.attributes.name,
            config: connectorResult.attributes.config,
          };
          // Get the user who created the connector (if available)
          connectorCreatedBy = connectorResult.created_by;
          ctxLogger.info(`[STEP] Connector retrieved: ${connector.actionTypeId}, created_by: ${connectorCreatedBy || 'unknown'}`);
        } catch (error) {
          ctxLogger.error(`[ERROR] Failed to get connector: ${error}`);
          return res.notFound({
            body: {
              message: `Connector ${connectorId} not found`,
            },
          });
        }

        // Verify connector type
        if (connector.actionTypeId !== '.slack') {
          ctxLogger.error(`[ERROR] Connector type mismatch: expected '.slack', got '${connector.actionTypeId}'`);
          return res.badRequest({
            body: {
              message: `Connector ${connectorId} is not a Slack connector`,
            },
          });
        }
        ctxLogger.info(`[STEP] Connector type verified as Slack`);
        ctxLogger.info(`[STEP] Space ID: ${spaceId}`);

        // Get decrypted connector secrets
        ctxLogger.info(`[STEP] Getting decrypted connector secrets...`);
        const connectorEncryptedClient = encryptedSavedObjects.getClient({
          includedHiddenTypes: [ACTION_SAVED_OBJECT_TYPE],
        });

        const decryptedConnector =
          await connectorEncryptedClient.getDecryptedAsInternalUser<{
            secrets?: SlackConnectorSecrets;
          }>(ACTION_SAVED_OBJECT_TYPE, connectorId, spaceId !== 'default' ? { namespace: spaceId } : {});

        const secrets = decryptedConnector.attributes.secrets;
        const signingSecret = secrets?.signingSecret;
        ctxLogger.info(`[STEP] Secrets retrieved. Has signingSecret: ${!!signingSecret}`);

        // Verify signature if signing secret is configured
        // Note: webhookUrl is for OUTGOING messages (sending to Slack)
        // signingSecret is for INCOMING events (verifying requests from Slack)
        // If signingSecret is not provided, we skip verification (less secure but functional)
        if (signingSecret) {
          const signature = req.headers['x-slack-signature'] as string | undefined;
          const timestamp = req.headers['x-slack-request-timestamp'] as string | undefined;
          
          // Get raw body for signature verification
          // Note: Slack sends JSON, so we stringify the parsed body for verification
          // This works because JSON.stringify produces a canonical representation
          const rawBody = JSON.stringify(slackEvent);

          const isValid = verifySlackSignature(
            signature,
            timestamp,
            rawBody,
            signingSecret,
            ctxLogger
          );

          if (!isValid) {
            ctxLogger.warn(`Invalid Slack signature for connector ${connectorId}`);
            return res.unauthorized({
              body: {
                message: 'Invalid Slack signature',
              },
            });
          }
        } else {
          // Log warning when signature verification is skipped
          ctxLogger.warn(
            `Slack connector ${connectorId} does not have signingSecret configured. ` +
            `Signature verification is skipped. This is less secure. ` +
            `To enable signature verification, add signingSecret to the connector secrets.`
          );
        }


        // Handle event_callback wrapper (Slack wraps all events in this)
        // url_verification is already handled above, so at this point we expect event_callback
        if (slackEvent.type === 'event_callback') {
          ctxLogger.info(`[PROCESSING] Received event_callback wrapper`);
          // Continue to process the nested event below
        } else {
          ctxLogger.warn(`[SKIPPED] Unexpected top-level event type: ${slackEvent.type}. Expected 'event_callback' (url_verification already handled). Full payload: ${JSON.stringify(slackEvent, null, 2)}`);
          return res.ok();
        }

        // Only process message events for now
        if (!slackEvent.event) {
          ctxLogger.warn(`[SKIPPED] Slack event has no 'event' field. Top-level type: ${slackEvent.type || 'unknown'}. Full payload: ${JSON.stringify(slackEvent, null, 2)}`);
          return res.ok();
        }
        
        if (slackEvent.event.type !== 'message') {
          ctxLogger.warn(`[SKIPPED] Slack event.event.type '${slackEvent.event.type}' is not 'message', skipping. Only message events are processed currently. Full event: ${JSON.stringify(slackEvent, null, 2)}`);
          return res.ok();
        }
        
        ctxLogger.info(`Processing Slack message event from channel: ${slackEvent.event.channel}`);

        // Normalize Slack event to platform format
        const normalizedEvent = normalizeSlackEvent(slackEvent);

        // Retrieve the connector's stored API key for workflow execution
        // This API key should have been created when the connector was configured for external events
        // It uses the user's authentication context, so workflows execute with the connector creator's permissions
        ctxLogger.debug(`Retrieving stored API key for connector ${connectorId}`);
        const apiKeyForEvent = await getConnectorApiKeyForExternalEvents({
          connectorId,
          spaceId,
          encryptedSavedObjects,
          logger: ctxLogger,
        });

        if (apiKeyForEvent) {
          ctxLogger.info(`Using stored API key ${apiKeyForEvent.apiKeyId} for connector ${connectorId}`);
        } else {
          ctxLogger.warn(
            `No stored API key found for connector ${connectorId}. ` +
            `The connector must be configured with an API key for external events. ` +
            `Event will be emitted without API key, workflows may fail if they require user privileges.`
          );
        }

        // Create connector-scoped request for event emission
        // If we have an API key, include it in the request so workflows execute with the connector creator's permissions
        const connectorRequest = apiKeyForEvent
          ? createConnectorScopedRequestWithApiKey(connectorId, spaceId, {
              id: apiKeyForEvent.apiKeyId,
              api_key: apiKeyForEvent.apiKey,
            })
          : createConnectorScopedRequest(connectorId, spaceId, req);

        // Emit event via workflowsExtensions
        ctxLogger.info(`Emitting event: ${JSON.stringify(normalizedEvent, null, 2)}`);
        const result = await workflowsExtensions.emitEvent({
          triggerType: 'external.event',
          payload: normalizedEvent,
          kibanaRequest: connectorRequest,
        });

        ctxLogger.info(`Event emitted successfully with ID: ${result.eventId}`);

        return res.ok({
          body: {
            eventId: result.eventId,
            message: 'Event processed successfully',
          },
        });
      } catch (error) {
        ctxLogger.error(`Error processing Slack event: ${error}`);

        if (isBoom(error)) {
          return res.customError({
            statusCode: error.output.statusCode,
            body: { message: error.output.payload.message },
          });
        }

        return res.customError({
          statusCode: 500,
          body: { message: error instanceof Error ? error.message : 'Unknown error' },
        });
      }
    }
  );
};
