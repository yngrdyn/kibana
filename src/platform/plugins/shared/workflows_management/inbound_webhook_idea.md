# External event endpoint for the Workflows inbound webhook connector

## Summary

Add a user-configured **Inbound Webhook** connector to the
`workflows_management` plugin and register it with the Actions plugin.

The connector exposes an external event URL containing a random 32-character
lowercase hexadecimal key:

```text
https://<kibana-host>/<base-path>/api/event/<webhookKey>
```

The webhook key is a UUIDv4 with its dashes removed and is used as a bearer
credential. When the endpoint receives a request, Workflows Management resolves
the key to an encrypted, space-scoped mapping containing the connector ID and
the API key granted for the latest editor who successfully saved the webhook.
It uses that API key to construct a synthetic `KibanaRequest` and delegates the
normalized payload to the connector's `receive` sub-action through the regular,
secured Actions client. The route must not contain workflow-specific execution
logic.

The connector implementation and UI live in Workflows Management. Actions owns
connector persistence, encrypted secrets, validation, and execution.

This is a focused Workflows implementation of an event-oriented public contract.
It does not introduce a generic Connectors event platform or an Actions-owned
ingress hub. The public route represents receipt of an external event while the
underlying connector remains an inbound webhook connector.

## Ownership and evolution

Workflows is the only initial consumer, so the connector, public endpoint,
mapping storage, and credential lifecycle live in `workflows_management` for
this phase. This keeps the first implementation local to the product that needs
it and avoids introducing a platform abstraction before there is a second
consumer.

The capability is not intended to remain a Workflows-specific webhook in the
larger architecture. If other products need inbound connector events, move the
connector and ingress implementation to `stack_connectors`, or migrate it to a
generic Connectors V2 event contract such as `ConnectorSpec.events`. Workflows
would then consume the emitted connector event instead of owning ingress.

The external contract is intentionally generic from the start:

```text
POST /api/event/{webhookKey}
```

Moving ownership later must preserve this route, existing URLs, and active
credentials through saved object migration or a compatibility layer. The move
must not require users or external systems to reconfigure their event URL. The
initial endpoint still accepts only this connector's fixed event and does not
act as a caller-selectable generic event hub.

### Future connector event pattern

The same pattern can eventually let connector implementations owned by other
plugins receive external events. An inbound-capable connector must provide two
capabilities:

1. a fixed `receive` sub-action that authenticates or validates the
   source-specific request, normalizes it, and emits one of the connector's
   declared event types;
2. automatic external subscription provisioning so users do not have to
   install or maintain vendor webhooks manually.

Automatic provisioning is a lifecycle rather than only a create operation. The
connector must register the generic Kibana event URL with the external service
after connector creation, update or rotate the remote subscription when its
credentials or URL change, and remove the remote subscription when the
connector is deleted. Provisioning failures must be visible through connector
health and repair flows. Vendors that do not offer a webhook-management API may
fall back to explicit setup instructions, but they do not satisfy the fully
automatic experience.

For example, a Jira connector could register `/api/event/{webhookKey}` with
Jira, normalize an incoming issue-created webhook in its `receive` sub-action,
and emit `jira.issueCreated`. A workflow could then subscribe with:

```yaml
triggers:
  - type: jira.issueCreated
    connector-id: production-jira
```

This enables workflows that create or update an Elastic case when a Jira issue
is created. Combined with outbound Jira actions and corresponding Case events,
the same model can support synchronization between Cases and Jira issues.
Bidirectional synchronization must use correlation identifiers, idempotency,
and loop prevention so an update propagated in one direction does not bounce
back indefinitely.

## Durable encrypted storage

The webhook-key-to-connector mapping must not be stored in a file on the Kibana
node.
Local filesystem storage is not shared by multiple Kibana instances, is not
durable across autoscaling or container replacement, and is unavailable or
ephemeral in Serverless.

Use a hidden, space-aware Encrypted Saved Object (ESO) instead:

```text
workflow_inbound_webhook
```

This still provides durable on-disk persistence, but through Kibana's supported
distributed storage layer. ESO encrypts the delegated ES and UIAM credentials
with `xpack.encryptedSavedObjects.encryptionKey`.

Do not persist the raw webhook key in searchable attributes. Use
`SHA-256(webhookKey)` as the saved object ID. The raw key appears only in the
external event URL stored in the connector's encrypted secrets.

## Goals

- The connector type and UI are owned by `workflows_management`.
- Users create, edit, rotate, and delete connector instances through the
  standard connector UI.
- Each connector has a unique, generated external event URL.
- The full external event URL is stored as an encrypted connector secret.
- A public external event route resolves the URL key to a connector ID.
- The user saving the webhook grants a managed API key used to continue work
  under that user's privilege scope.
- Delegated ES and UIAM credentials are encrypted in an ESO and never returned
  to the browser.
- The route delegates a normalized payload to one fixed connector sub-action.
- The route and mapping model can later be generalized for connectors owned by
  other plugins without changing the public event URL.
- Mappings are space-aware and work with multiple Kibana nodes.
- Every successful connector save rotates delegated credentials to the current
  editor while URL rotation remains explicit.
- Mapping and API-key lifecycles follow connector create, edit, URL rotation,
  cleanup, and deletion.

## Non-goals

- Do not put the initial workflow-only route or connector implementation in
  Actions or `stack_connectors`; revisit ownership when another consumer exists.
- Do not introduce Connectors V2 or a generic ingress hub in the initial phase.
- Do not expose a caller-selected connector ID, event ID, or sub-action in the
  external event API.
- Do not let the route execute arbitrary connector types.
- Do not put workflow selection or workflow execution logic in the route.
- Do not support form, multipart, or arbitrary binary bodies initially.
- Do not store webhook keys in plaintext outside encrypted connector secrets.
- Do not expose delegated API-key credentials through connector APIs or the
  external event response.

## Connector contract

Suggested connector type ID:

```ts
export const InboundWebhookConnectorTypeId = '.workflows-inbound-webhook';
```

This is a normal user-configured connector, not a system action:

```ts
interface InboundWebhookConfig {
  /**
   * Non-secret digest used to repair and validate the routing mapping.
   * This is safe to persist outside encrypted secrets because the webhook key
   * has sufficient entropy and cannot feasibly be recovered from its SHA-256
   * hash.
   */
  webhookKeyHash: string;
  /**
   * Non-secret credential-revision UUID regenerated by the client for every
   * create/update request. Used to correlate the persisted connector revision
   * with ESO promotion.
   */
  credentialRevision: string;
}

interface InboundWebhookSecrets {
  /**
   * Full externally callable URL, including the webhook-key bearer credential.
   */
  webhookUrl: string;
}

interface ReceiveWebhookParams {
  subAction: 'receive';
  subActionParams: {
    eventId: string;
    credentialRevision: string;
    body: Record<string, unknown>;
    query: Record<string, string | string[]>;
    headers: Record<string, string>;
    receivedAt: string;
  };
}
```

Only `receive` is supported. The endpoint always constructs this sub-action;
the external caller cannot supply `subAction`, `connectorId`, `spaceId`, or
`credentialRevision`.
It also supplies the trusted mapping `credentialRevision`; the executor rejects
the call unless it equals `config.credentialRevision` on the connector.

The connector executor emits the registered `inboundWebhook.received` event
using the synthetic user-scoped request received in its execution options. It
does not select or execute workflows directly.

## Workflow trigger contract

Workflows subscribe to a specific inbound webhook connector with this trigger:

```yaml
triggers:
  - type: inboundWebhook.received
    connector-id: webhook-connector-1
    on:
      condition: 'event.body.severity: "critical"'
```

The trigger fields are:

- `type`: the registered event ID `inboundWebhook.received`;
- `connector-id`: required Actions connector ID for one
  `.workflows-inbound-webhook` connector in the workflow's space;
- `on.condition`: optional KQL expression evaluated against the normalized
  event after connector matching.

Parse and validate `on.condition` when the workflow is saved or enabled.
Invalid KQL prevents enablement. Runtime evaluation errors skip that workflow,
emit an audit/error metric, and do not fail scheduling for other matching
workflows.

Register `inboundWebhook.received` through
`workflowsExtensions.registerTriggerDefinition` with the normalized event
schema, documentation, and snippets. Extend the registered-trigger schema path
for this connector-bound trigger so it preserves required `connector-id`
alongside the standard `on` block. This is not a hand-written built-in trigger
in `builtin_trigger_definitions.ts`, and it does not require a generic
`ConnectorSpec.events` contract.

The visual/YAML editor resolves `connector-id` through the existing Workflows
connector API and offers only `.workflows-inbound-webhook` instances from the
current space. A missing or deleted connector produces a validation warning and
runtime scheduling is skipped with an audit event; it must not fall back to a
connector with the same name or an internal execution path.

The normalized event is strict:

```ts
interface InboundWebhookReceivedEvent {
  connectorId: string;
  eventId: string;
  body: Record<string, unknown>;
  query: Record<string, string | string[]>;
  headers: Record<string, string>;
  receivedAt: string;
}
```

The `receive` sub-action emits one `inboundWebhook.received` event with
`connectorId` taken from the resolved mapping, never from caller input. Matching
runs in this order:

1. discover enabled workflows through the Workflows client scoped to the
   synthetic request;
2. select `inboundWebhook.received` triggers whose `connector-id` equals
   `event.connectorId`;
3. evaluate each trigger's optional `on.condition` as KQL against the event;
4. schedule only matching workflows using the same synthetic request.

Workflow discovery and scheduling must never use an internal client. This
ensures the delegated user can trigger only workflows they are authorized to
read and execute.

## Server registration

Register the connector type during Workflows Management server setup:

```ts
plugins.actions.registerType(
  getInboundWebhookConnectorType({
    mappingRepository,
    apiKeyService,
    getSpaceId: (request) => plugins.spaces.spacesService.getSpaceId(request),
  })
);
```

This is separate from the existing `.workflows` system connector:

- `.workflows` connects an alerting rule to a workflow.
- `.workflows-inbound-webhook` accepts an external request and delegates it to
  its `receive` sub-action.

The new connector must not set `isSystemActionType: true`; users need persisted
connector instances.

Use:

```ts
supportedFeatureIds: [WorkflowsConnectorFeatureId];
```

Add the connector's `receive` action to
`common/connector_sub_actions_map.ts` so Workflows connector discovery and
autocomplete understand its supported sub-action.

Register the public connector model with
`triggersActionsUi.actionTypeRegistry`, alongside the existing Workflows
connector model.

Register the `inboundWebhook.received` workflow trigger through the Workflows
extension registry. Teach registered-trigger schema generation, autocomplete,
and the workflow trigger event handler about its required `connector-id`. The
event handler must match `connector-id` before evaluating `on.condition`.

Register corresponding server and public trigger definitions during Workflows
Management setup so execution, validation, autocomplete, hover documentation,
and snippets use the same event ID and event schema.

## Mapping storage

Register a hidden saved object type with Core and Encrypted Saved Objects:

```ts
core.savedObjects.registerType({
  name: 'workflow_inbound_webhook',
  hidden: true,
  namespaceType: 'multiple-isolated',
  management: { importableAndExportable: false },
  mappings: inboundWebhookMappings,
  modelVersions: inboundWebhookModelVersions,
});

plugins.encryptedSavedObjects.registerType({
  type: 'workflow_inbound_webhook',
  attributesToEncrypt: new Set(['secrets']),
  attributesToIncludeInAAD: new Set(['connectorId', 'connectorTypeId', 'createdAt']),
});
```

Workflows Management must add `encryptedSavedObjects` as a required server
plugin and reject webhook creation with a clear error when
`plugins.encryptedSavedObjects.canEncrypt` is false.

The closest existing token-to-connector precedent is Actions'
`OAuthStateClient` in
`x-pack/platform/plugins/shared/actions/server/lib/oauth_state_client.ts`.
It maps high-entropy state to a connector and space using Elasticsearch-backed
saved objects. Alerting rules and Task Manager provide the precedent for
granting, storing, using, rotating, and invalidating user-scoped ES and UIAM API
keys.

Suggested saved object attributes:

```ts
interface InboundWebhookSavedObject {
  connectorId: string;
  connectorTypeId: '.workflows-inbound-webhook';
  status: 'pending' | 'active';
  targetWebhookKeyHash?: string;
  credentialRevision: string;
  apiKeyId: string;
  uiamApiKeyId?: string;
  credentialVersion: number;
  delegatedUsername?: string;
  delegatedUserProfileId?: string;
  createdAt: string;
  updatedAt: string;
  secrets: {
    /**
     * base64("<api-key-id>:<api-key-secret>")
     */
    apiKey: string;
    /**
     * Encoded UIAM key when UIAM is enabled.
     */
    uiamApiKey?: string;
  };
}
```

Document ID:

```text
active:  <sha256(webhookKey)>
pending: pending:<connectorId>:<credentialRevision>
```

The Saved Object namespace supplies the space boundary. Immutable
`connectorId`, `connectorTypeId`, and `createdAt` are included in AAD. Mutable
fields such as `status`, operation metadata, key IDs, ownership metadata, and
`updatedAt` must not be included in AAD.

The repository must use
`encryptedSavedObjectsClient.getDecryptedAsInternalUser()` when resolving a
webhook. Standard Saved Object `get`/`find` calls strip the encrypted
`secrets` attribute.

Do not partially update `secrets` or any AAD field. Key rotation replaces the
entire saved object with a full encrypt-and-write operation. A type-safe partial
update helper may change only safe non-encrypted fields such as `status` and
`updatedAt`.

The repository should expose:

```ts
interface InboundWebhookMappingRepository {
  stage(input: {
    credentialRevision: string;
    webhookKeyHash: string;
    connectorId: string;
    spaceId: string;
    credentials: DelegatedWebhookCredentials;
  }): Promise<{ pendingId: string }>;

  promote(input: {
    pendingId: string;
    connectorId: string;
    spaceId: string;
    expectedActiveVersion?: string;
  }): Promise<InboundWebhookSavedObject>;

  resolve(input: {
    webhookKeyHash: string;
    spaceId: string;
  }): Promise<(InboundWebhookSavedObject & { spaceId: string }) | undefined>;

  deleteForConnector(input: {
    connectorId: string;
    spaceId: string;
  }): Promise<void>;

  deletePending(input: {
    pendingId: string;
    spaceId: string;
  }): Promise<void>;
}
```

Resolution is a direct document lookup, not a scan of Actions connector saved
objects. The route hashes the URL key, performs a namespace-scoped lookup by
saved object ID, and decrypts the credential internally.

### Delegated API-key service

Create a Workflows-owned `InboundWebhookApiKeyService` that follows the
Alerting/Task Manager credential strategy:

1. Resolve the authenticated user from the connector-save `KibanaRequest`.
2. If the request is authenticated by an API key, clone it into a new
   framework-managed key with `cloneAsInternalUser`; never persist or reuse the
   caller-owned credential.
3. Otherwise grant a framework-managed ES API key on behalf of the current
   user:

   ```ts
   security.authc.apiKeys.grantAsInternalUser(request, {
     name: `Workflows inbound webhook: ${connectorId}`,
     role_descriptors: {},
     metadata: {
       managed: true,
       kibana: { type: 'workflows_inbound_webhook', connectorId },
     },
   });
   ```

4. When UIAM is enabled and the incoming credential is compatible, also grant
   and persist a UIAM key, following Task Manager's
   `EsAndUiamApiKeyStrategy`.
5. Grant fresh credentials on every connector create or edit. Credentials have
   no fixed expiration because a webhook must continue running unattended.
6. Invalidate prior ES and UIAM keys only after the newly staged credentials
   are promoted successfully.
7. Invalidate newly granted credentials when connector persistence or
   promotion fails.

This API key intentionally delegates the latest successful editor's privileges.
Possession of the external event URL therefore authorizes an external caller to
initiate the connector's fixed `receive` operation as that user. This is an
explicit product trust decision, not accidental impersonation.

## Connector lifecycle and consistency

Use the connector type's `preSaveHook`, `postSaveHook`, and `postDeleteHook`.
These hooks receive connector secrets and run for create/update/delete, unlike
cross-plugin lifecycle listeners, which intentionally omit secrets.

### Create

1. UI generates a 32-character lowercase hexadecimal webhook key and sends:
   - `secrets.webhookUrl`
   - `config.webhookKeyHash`
   - a new `config.credentialRevision`
2. `preSaveHook` parses the webhook key from `webhookUrl`, validates it against
   `^[0-9a-f]{32}$`, recomputes SHA-256, and rejects the save if it does not
   match `config.webhookKeyHash`.
3. `preSaveHook` verifies that the editor can execute this connector and can read
   and execute workflows in the current space.
4. `preSaveHook` grants/clones fresh managed ES and, when applicable, UIAM
   credentials for the authenticated editor.
5. `preSaveHook` writes a pending encrypted record keyed by the unique
   `credentialRevision`; no active mapping exists yet.
6. Actions persists the connector and encrypted external event URL.
7. `postSaveHook`, when `wasSuccessful: true`, decrypts the pending record,
   re-encrypts it as the active `<sha256(webhookKey)>` record, verifies it can be
   resolved, and deletes the pending record.
8. If connector persistence or promotion fails, cleanup deletes the pending
   record and invalidates every newly granted key.

The inbound route rejects inactive mappings. This prevents a webhook call from
reaching a connector that has not been persisted yet.

`postSaveHook` errors are logged and swallowed by Actions. Therefore, a failed
activation can leave a saved connector with a disabled webhook. Emit telemetry
for this condition and expose an authenticated repair operation.

### Every connector edit

Every successful edit transfers future webhook execution to the editor's
current privilege scope:

1. Keep the current active mapping and credentials available while the edit is
   in progress.
2. Grant/clone fresh managed ES/UIAM credentials for the current editor.
3. Create a separate pending encrypted record containing the new credentials,
   target URL hash, requested `credentialRevision`, incremented
   `credentialVersion`, and the active record's optimistic-concurrency version.
4. Persist the connector edit.
5. Promote the pending record only if the active version still matches.
6. Verify the promoted credentials, then invalidate the previous managed
   credentials and remove the pending record.
7. On failure, retain the previous mapping only for rollback/cleanup and
   invalidate the newly granted credentials. Once the connector's new
   `credentialRevision` is persisted, old mappings fail the executor revision
   check and cannot continue running under the previous editor's authority.

Concurrent edits use optimistic concurrency. A stale promotion loses, cleans up
its pending credentials, and reports a webhook health error; it must not
overwrite a newer editor's scope.

### URL rotation

URL rotation remains explicit:

1. Generate a new 32-character lowercase hexadecimal key, URL, and hash.
2. Run the same every-edit credential rotation using the new hash as the
   pending record's target.
3. Promote the new active mapping.
4. Delete the old hash mapping only after the new mapping and credentials are
   verified.

Rotation invalidates the old URL. An ordinary edit preserves the URL but still
rotates credentials to the current editor.

### Delete

`postDeleteHook` removes every mapping for the connector in its space and
invalidates all active and pending framework-managed ES/UIAM credentials.

### Repair

Actions currently logs and swallows `postSaveHook` failures after the connector
has already been saved. Therefore, mapping activation cannot be assumed to be
transactional.

Keep `webhookKeyHash` in connector config so a later reconciliation task or an
explicit "repair webhook" action can locate the expected mapping. Repair must
require an authenticated user and grant fresh credentials; it must not attempt
to recover an API-key secret that Elasticsearch no longer exposes.

A periodic cleanup task finds expired pending records, invalidates their
credentials, and removes them. It also retries failed invalidations recorded in
a durable cleanup queue. Cleanup is idempotent and must never invalidate the
credentials referenced by the current active mapping.

## Public endpoint

Initial route:

```text
POST /api/event/{webhookKey}
```

Generate the URL from Kibana's current public base path. When the editor is in a
space, that base path already carries the space prefix; the public contract does
not define a separate space-specific route shape.

The route:

1. Validates `webhookKey` against `^[0-9a-f]{32}$`.
2. Resolves the request's space.
3. Computes `SHA-256(webhookKey)`.
4. Loads and decrypts `<hash>` from the current space's
   `workflow_inbound_webhook` saved object namespace.
5. Returns the same `404` response for missing, inactive, stale, or invalid
   mappings to avoid leaking connector existence.
6. Selects the UIAM or ES credential according to the configured API-key
   strategy.
7. Constructs a synthetic `KibanaRequest` containing that credential and the
   saved space ID.
8. Creates a normal request-scoped Actions client from the synthetic request.
9. Generates an `eventId` and normalizes the request into
   `ReceiveWebhookParams`.
10. Executes the resolved connector through the secured Actions client.
11. Returns a small, stable response that does not expose connector internals.

Example hand-off:

```ts
const fakeRequest = kibanaRequestFactory({
  headers: {
    authorization: apiKeyService.getAuthorizationHeader(mapping.secrets),
  },
  spaceId: asSpaceId(mapping.spaceId),
});

const actionsClient = await actions.getActionsClientWithRequestInSpace(
  fakeRequest,
  mapping.spaceId
);

await actionsClient.execute({
  actionId: mapping.connectorId,
  params: {
    subAction: 'receive',
    subActionParams: {
      eventId: crypto.randomUUID(),
      credentialRevision: mapping.credentialRevision,
      body: request.body,
      query: request.query,
      headers: filterHeaders(request.headers),
      receivedAt: new Date().toISOString(),
    },
  },
});
```

`getAuthorizationHeader` must handle ES and UIAM credential formats exactly as
their respective Security APIs require. Do not import Task Manager's private
fake-request implementation. Use the public Core request factory, or propose a
shared Security helper if more plugins need this pattern.

The connector executor receives the synthetic request in its execution options.
When `receive` emits a Workflows event or schedules a workflow, it must pass
that request forward. Task Manager then persists the user scope on the workflow
task, and the execution engine uses the resulting fake request for both
`actions.getActionsClientWithRequest(fakeRequest)` and
`elasticsearch.client.asScoped(fakeRequest).asCurrentUser`.

Do not use `UnsecuredActionsClient` in this design. The saved delegated
credential allows the normal Actions authorization path to enforce the latest
editor's captured privileges.

## Authorization model

Connector creation and every edit must preflight the authenticated editor
before granting credentials. The editor needs:

- permission to create or update this connector;
- permission to execute the inbound webhook connector type;
- Workflows read and execute privileges in the current space.

The preflight uses the real authenticated save request. It must complete before
granting ES/UIAM keys, avoiding credentials that can never execute the feature.
The synthetic request later performs normal Actions and Workflows authorization
again; preflight is an early error, not a substitute for runtime checks.

Workflow subscription discovery must use the Workflows client scoped to the
synthetic request. A workflow containing a matching `connector-id` is not
automatically executable: the delegated principal must also be authorized to
read and execute it.

Every successful connector save changes the delegated principal to the current
editor and captures that editor's effective privileges. Existing API keys do
not automatically follow later role reductions. To apply reduced privileges,
an authorized user must save the connector again or revoke/repair its
credentials. The connector UI and audit log must identify the current delegated
principal and credential version without exposing credentials.

## Route security

The 32-character webhook key is the connector's bearer credential. Anyone with
the URL can invoke the connector.

The route needs an explicit security design because production Kibana routes
normally require authentication and authorization:

- `security.authc` must be explicitly disabled because the URL key authenticates
  the webhook rather than a Kibana session;
- `security.authz` must use an explicit, reviewed opt-out reason because
  authorization is delegated to webhook mapping resolution and the secured
  Actions client created with the saved user credential;
- XSRF enforcement must be disabled for this external POST endpoint;
- the request must never inherit the privileges of an anonymous Kibana user;
- connector execution must use only the decrypted delegated credential and the
  fixed connector/sub-action stored in the mapping;
- global/source-address rate limiting must run before ESO lookup, and
  distributed per-key limiting must run after successful key resolution;
- request body size must be capped (suggested initial limit: 1 MiB);
- only `application/json` should be accepted initially;
- `Authorization`, `Cookie`, `Host`, the webhook key, and proxy credentials
  must not be forwarded to the connector sub-action;
- the full URL/key must not appear in application, audit, error, or access
  logs;
- return `404` for an invalid key and avoid distinguishable timing or error
  messages where practical.

Proposed route options:

```ts
{
  path: '/api/event/{webhookKey}',
  security: {
    authc: {
      enabled: false,
      reason: 'The external event URL contains the credential used to authenticate the caller',
    },
    authz: {
      enabled: false,
      reason: 'Authorization is delegated to webhook mapping resolution and a user-scoped Actions client',
    },
  },
  options: {
    access: 'public',
    xsrfRequired: false,
    tags: ['api'],
  },
}
```

The route must remain subject to rate limiting; it must not set
`excludeFromRateLimiter: true`.

Rate-limit state must be shared across Kibana nodes. Unknown-key traffic is
limited by source address before it can cause repeated ESO decryptions. Known
keys receive a configurable per-key request and concurrency budget. Rate-limit
responses use `429` with `Retry-After` and do not reveal whether a key exists.

Generate the key with `crypto.randomUUID().replaceAll('-', '')`. Removing the
dashes preserves UUIDv4's approximately 122 bits of randomness while producing
the canonical lowercase `^[0-9a-f]{32}$` route value. A 256-bit random token
would be stronger, but the dashless UUIDv4 format is retained here as an
explicit product requirement.

The exact mechanism for permitting an unauthenticated production route needs
Security team review before implementation. There are no ordinary plugin
routes in the repository that should be copied blindly as a precedent.

The delegated API key is long-lived authority. Role reductions do not
automatically rotate existing keys, and audit events represent the latest
successful editor even though the immediate caller is an external system.
Every connector save rotates credentials; deletion, repair, and administrative
revocation must also terminate the previous authority.

### Audit events

Emit audit events for:

- webhook connector creation and URL rotation;
- credential grant/clone and promotion, including principal and credential
  version but not key material;
- accepted invocation, condition-filtered invocation, rate-limit rejection,
  authorization denial, and scheduling failure;
- stale pending cleanup, failed-key invalidation retry, repair, and deletion.

Never include the raw webhook key, full URL, request `Authorization`/`Cookie`
headers, ES/UIAM secrets, or unfiltered request body in audit attributes.
Invocation audit records should include only `eventId`, connector ID, space,
outcome, and safe request metadata.

## Connector UI

The form is intentionally small:

- read-only external event URL field;
- copy-to-clipboard button;
- generate button during creation;
- rotate button during edit, with a confirmation that the old URL stops
  working after save;
- current delegated principal and credential version;
- notice that every successful save moves future webhook execution to the
  current editor's privilege scope;
- webhook health and authenticated repair action.

The form generates a new non-secret `config.credentialRevision` on every submit,
including edits that do not rotate the URL. After Actions reports save success,
the UI polls webhook status and compares the active mapping revision with the
connector config revision. It reports success only when they match; otherwise
it shows `updating` or `degraded` and offers repair.

Creation flow:

1. Generate the key with
   `crypto.randomUUID().replaceAll('-', '')`.
2. Build the URL using the current public origin and Kibana/space base path.
3. Set `secrets.webhookUrl`.
4. Compute SHA-256 in the browser and set `config.webhookKeyHash`.
5. Display the URL and allow copying before save.

Do not regenerate on each render. Generate only when the field has no value or
when the user explicitly chooses **Rotate**.

Actions does not return decrypted connector secrets when editing. Consequently,
the existing full external event URL cannot be reconstructed from
`secrets.webhookUrl` in the edit form. The initial implementation should:

- show "External event URL is configured" when editing;
- preserve the existing secret on normal edits;
- show the newly generated URL only during explicit rotation;
- warn users to copy a URL when it is first generated or rotated.

If product requirements demand showing the existing URL later, add a privileged
server operation that decrypts only this connector's URL after authorization
and auditing. Do not copy the raw URL into connector config.

## Request and response shape

Initial request:

```http
POST /api/event/550e8400e29b41d4a716446655440000
Content-Type: application/json
Idempotency-Key: deployment-dep-123-completed

{
  "event": "deployment.completed",
  "deploymentId": "dep-123"
}
```

Suggested success response:

```http
HTTP/1.1 202 Accepted
Content-Type: application/json

{
  "accepted": true,
  "eventId": "f5b514f5-73f3-4e8b-9154-75f975a41090"
}
```

Return `202` only after `receive` has emitted the event and Task Manager has
durably scheduled every matching workflow. The response does not wait for
workflow completion. Zero matching workflows is still an accepted event.

Do not return the connector ID, workflow ID, internal execution result, stack
trace, or mapping state.

## Delivery, idempotency, and concurrency

Delivery is at least once unless the caller supplies `Idempotency-Key`.

For requests with that header:

1. hash the idempotency key together with the connector ID;
2. reserve a space-scoped delivery record before event emission;
3. store `eventId`, a request-body digest, status, and expiry;
4. return the original `eventId` for an identical retry;
5. return `409` if the same idempotency key is reused with a different body.

Delivery records contain no raw webhook key, API credentials, headers, or body
and expire through a cleanup task. Concurrent reservations use optimistic
concurrency so only one request emits the event.

Workflow scheduling is also idempotent: derive each workflow task ID from
`eventId` and workflow ID. A retry schedules only missing tasks and treats an
already-existing matching task as success. Mark the delivery record complete
only after every matching task is durably present; this avoids duplicating
successfully scheduled workflows after a partial failure.

The route has a configurable request timeout. If scheduling does not complete,
return a retryable `503`; a caller using `Idempotency-Key` can retry without
duplicating a successfully reserved/emitted event. Callers may retry `429`,
`502`, `503`, and `504` with backoff, but should not retry other `4xx`
responses without changing the request.

Apply both:

- a distributed per-key request limit;
- a per-key in-flight scheduling limit that prevents one webhook from consuming
  the workflow scheduling pool.

The initial payload limit is 1 MiB of JSON. Event payloads become part of
workflow execution data, so retention, redaction, and access controls follow
Workflows execution storage policy. Incoming sensitive headers are removed
before event creation.

## Health, repair, and cleanup

Expose an authenticated webhook status operation for connector owners:

```ts
type InboundWebhookHealth =
  | {
      status: 'active';
      credentialVersion: number;
      credentialRevision: string;
      principal: string;
    }
  | { status: 'updating'; credentialRevision: string }
  | { status: 'degraded'; reason: 'promotion_failed' | 'credentials_revoked' | 'decrypt_failed' }
  | { status: 'disabled'; reason: 'missing_mapping' | 'encryption_unavailable' };
```

The status response never contains the external event URL, key hash, or API-key
material. The connector UI displays degraded/disabled state and offers an
authenticated **Repair credentials** action. Repair performs the same
preflight and two-phase rotation as a normal save.

Status loads the connector through the caller's secured Actions client and
compares `config.credentialRevision` with the active ESO revision. A mismatch
after connector save is `degraded: promotion_failed`, even when the previous
mapping record remains for cleanup. The executor rejects that mismatched
revision, preventing calls from continuing under the previous principal.

Periodic cleanup:

- removes expired pending records and idempotency records;
- invalidates credentials belonging to abandoned pending records;
- retries durable failed-invalidation entries;
- detects multiple active mappings for one connector and disables all but the
  highest verified credential version;
- records metrics and audit events for every repair action.

Cleanup and repair are idempotent. They compare connector ID, mapping version,
and credential version before invalidating anything.

## Copy, import, and space behavior

External event URLs and delegated credentials are bound to one connector and one
space. Copy, import, clone, or copy-to-space must not transfer the active ESO,
URL secret, API keys, pending records, or delivery records.

A copied/imported connector is created with its webhook disabled and missing
secrets. An authorized user in the destination space must open and save it to
generate a new webhook key, grant new credentials, and create a
destination-scoped mapping. Moving a connector is implemented as destination
creation followed by source deletion only after destination activation
succeeds.

Deleting a space follows the same cleanup/invalidation path as connector
deletion. Restoring connector saved objects without their ESO mappings leaves
the webhook disabled until repaired.

## Expected file layout

```text
src/platform/packages/shared/kbn-workflows/
  spec/
    schema/triggers/
      index.ts

src/platform/plugins/shared/workflows_execution_engine/
  server/trigger_events/
    trigger_event_handler.ts

src/platform/plugins/shared/workflows_management/
  common/
    inbound_webhook/
      constants.ts
      event_schema.ts
      schemas.ts
      types.ts
  server/
    connectors/
      inbound_webhook/
        index.ts
        executor.ts
        schema.ts
        types.ts
    triggers/
      inbound_webhook_received.ts
    api/routes/
      external_event/
        post_event.ts
        post_event.test.ts
      inbound_webhook/
        get_webhook_status.ts
        repair_webhook.ts
    saved_objects/
      inbound_webhook.ts
      inbound_webhook_delivery.ts
      inbound_webhook_cleanup.ts
    storage/
      inbound_webhook_mapping_repository.ts
      inbound_webhook_delivery_repository.ts
    services/
      inbound_webhook_api_key_service.ts
      inbound_webhook_event_service.ts
    tasks/
      inbound_webhook_cleanup_task.ts
  public/
    triggers/
      inbound_webhook_received.ts
    connectors/
      inbound_webhook/
        inbound_webhook.tsx
        inbound_webhook_connectors.tsx
        inbound_webhook_connectors.test.tsx
        translations.ts
        types.ts
```

Also add `encryptedSavedObjects` to the Workflows Management server plugin
dependencies and wire Security/ESO start services into the mapping repository
and API-key service.

## Sequence

```text
User opens connector form
  -> UI generates dashless UUIDv4 webhook key, URL, and SHA-256 hash
  -> User saves connector
  -> preflight verifies connector and workflow privileges
  -> connector preSaveHook grants/clones managed ES/UIAM credentials for editor
  -> connector preSaveHook creates pending encrypted credentials
  -> Actions encrypts webhookUrl and persists connector
  -> connector postSaveHook promotes pending credentials with OCC
  -> old credentials are invalidated after verified promotion

External system POSTs to external event URL
  -> WM route validates the 32-character lowercase hex key and hashes it
  -> WM ESO repository resolves connector ID and decrypts delegated credentials
  -> WM builds a fake request for latest editor scope and space
  -> WM reserves eventId/idempotency record and builds fixed `receive` params
  -> secured ActionsClient authorizes and loads/decrypts the connector
  -> Inbound Webhook connector executes `receive`
  -> receive emits registered `inboundWebhook.received` using the fake request
  -> enabled workflows match trigger.connector-id and optional on.condition
  -> matching workflows are durably scheduled under latest editor scope
  -> endpoint returns 202 with eventId
```

## Tests

### Trigger schema and editor tests

- registers `inboundWebhook.received` with its strict event schema;
- accepts `type: inboundWebhook.received` with required `connector-id` and
  optional `on.condition`;
- rejects missing connector ID, unknown fields, and a top-level `condition`;
- indexes `connector-id` for subscription discovery;
- editor autocomplete lists only inbound webhook connectors in the current
  space;
- missing/deleted connector IDs produce diagnostics and never name-based
  fallback.

### Connector unit tests

- registers as a user-configured connector;
- accepts only `receive`;
- validates URL, dashless UUIDv4 webhook key, and matching hash;
- rejects mapping/connector credential-revision mismatch;
- filters or rejects unsupported params;
- emits the strict `inboundWebhook.received` event with connector ID from
  trusted mapping data;
- forwards the synthetic request to event discovery and scheduling;
- matches `connector-id` before evaluating the optional KQL `on.condition`;
- returns typed executor results;
- does not log URL, webhook key, or API-key credentials.

### Lifecycle tests

- create grants credentials and stages/activates an encrypted mapping;
- failed create removes the staged mapping and invalidates newly granted keys;
- every edit rotates credentials to the current editor while preserving URL;
- every create/edit requires a fresh `credentialRevision` and promotion records
  the same revision;
- URL rotation activates a new hash and credentials before deleting the old;
- API-key-authenticated edits clone into a framework-managed key;
- stale concurrent promotions lose without replacing current credentials;
- delete removes active/pending mappings and invalidates all managed keys;
- abandoned pending records and failed invalidations are cleaned up;
- UIAM and ES-key fallback paths match the configured strategy;
- mapping-hook failure is logged and measurable.

### Route tests

- valid 32-character lowercase hexadecimal key decrypts credentials and executes
  through a scoped Actions client;
- malformed key, missing mapping, inactive mapping, wrong space, stale
  connector, and wrong connector type all return the same `404`;
- missing/corrupt/revoked credentials fail closed;
- stale mapping revision cannot execute after connector save;
- the fake request contains the saved space and selected ES/UIAM credential;
- Actions authorization failures are not retried through an unsecured client;
- external caller cannot select connector ID or sub-action;
- body/query/allowed headers are handed over correctly;
- sensitive headers are removed;
- oversized and non-JSON payloads are rejected;
- connector errors are converted to a stable external error;
- aborted requests abort connector execution where supported;
- idempotent retries return the original event ID without re-emitting;
- idempotency-key reuse with a different body returns `409`;
- distributed source/key limits and concurrency limits return stable `429`
  responses;
- no key is present in logs.

### UI tests

- creation generates exactly one dashless UUIDv4 webhook key;
- URL uses `/api/event/{webhookKey}` under Kibana's current public base path;
- URL and hash are submitted in secrets/config respectively;
- copy action works;
- ordinary edits preserve URL and show that credentials move to the editor;
- every submission generates a fresh non-secret credential revision and waits
  for status confirmation;
- URL rotation requires confirmation and submits a new URL/hash;
- active/updating/degraded/disabled health states render safely;
- repair triggers an authenticated credential rotation;
- edit mode does not claim to display an unavailable encrypted secret.

### Integration/Scout tests

- create connector through UI/API;
- create a workflow with `type: inboundWebhook.received`, matching
  `connector-id`, and KQL `on.condition`;
- invoke generated URL without a Kibana session;
- assert only connector/condition-matching workflows run;
- assert subscribed workflow actions run with the latest editor's privileges;
- assert an operation outside the latest editor's privileges is denied;
- edit as a second user and assert subsequent calls use the second user's scope;
- invoke from another space and assert `404`;
- rotate and assert old URL fails/new URL succeeds;
- reduce/revoke access, save, and assert the reduced scope;
- concurrently edit and assert only one credential version becomes active;
- copy/import into another space and assert the copy remains disabled until
  initialized;
- verify idempotent retry and pending-record cleanup;
- delete and assert URL fails;
- assert connector deletion invalidates managed ES/UIAM keys;
- run with two Kibana instances against the same Elasticsearch cluster.

## Open product decisions

1. What are the concrete timeout, per-key request, and concurrency defaults?
2. What is the idempotency-record retention period?
3. Must users be able to reveal an existing URL after creation, or is
   copy-on-create plus rotation sufficient?
4. Which licenses and connector feature IDs should expose this connector?
5. What deployment-level access-log redaction is required for URL bearer keys?
6. Which additional consumer should trigger extraction to `stack_connectors`,
   and should that extraction use the existing connector model or Connectors V2?
7. What standard lifecycle contract should connectors use to create, update,
   repair, and delete remote webhook subscriptions?

## Acceptance criteria

- Connector source and UI live in `workflows_management`.
- Connector is registered with Actions and is user-created.
- The public endpoint is `POST /api/event/{webhookKey}` under Kibana's current
  public base path.
- The public route is not Workflows-specific and remains stable if ingress
  ownership later moves to `stack_connectors` or Connectors V2.
- A future ownership migration preserves existing URLs and credentials without
  requiring external-system reconfiguration.
- The future inbound-connector contract requires a fixed `receive` sub-action
  and automatic remote subscription provisioning with cleanup and repair.
- Connector-owned event IDs such as `jira.issueCreated` can be exposed to
  Workflows without adding vendor-specific behavior to the public route.
- The URL contains a lowercase 32-character hexadecimal webhook key generated
  by removing the dashes from a UUIDv4.
- The full URL is encrypted in connector secrets.
- The raw webhook key is not stored in searchable mapping attributes.
- The mapping is a hidden, space-aware Encrypted Saved Object.
- Delegated ES/UIAM credentials are encrypted and never returned to clients.
- Webhook creation fails closed when ESO encryption is unavailable.
- Mapping storage works across Kibana nodes and restarts.
- Create, every edit, URL rotation, cleanup, and deletion keep mappings and
  managed credential lifecycles synchronized.
- The generated URL inherits the editor's current Kibana base path, and mapping
  resolution remains namespace scoped.
- The route always invokes the fixed `receive` sub-action.
- The route uses a user-scoped Actions client, not `UnsecuredActionsClient`.
- Workflows subscribe with `type: inboundWebhook.received`, required
  `connector-id`, and optional KQL `on.condition`.
- Workflow discovery matches connector ID and condition using only the scoped
  synthetic request.
- Subscribed workflow execution receives the saved fake request and runs with
  the latest successful editor's captured privileges.
- External callers cannot select event IDs or execute arbitrary connector IDs
  or sub-actions.
- Sensitive request data and webhook keys are not logged or forwarded.
- API-key-authenticated saves clone into framework-managed credentials.
- Previous and abandoned credentials are invalidated without disrupting the
  active credential version.
- A stale mapping cannot execute when its credential revision differs from the
  persisted connector config.
- `202` is returned only after durable scheduling, with idempotent retry support.
- Concurrent edits cannot create multiple active credential versions.
- Copy/import/space-copy never transfers URLs or delegated credentials.
- Health, repair, cleanup, rate limiting, auditing, and secret-safe telemetry
  are defined.
- The unauthenticated route and delegated user-credential model receive
  explicit Security, Task Manager, and Actions owner review.
