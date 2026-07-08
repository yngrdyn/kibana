/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Polls the server step registry until async extension registrations have finished.
 * Doc generators read label, schemas, and documentation directly from the server
 * registry (`GET .../step_definitions?includeDocs=true`); no browser or public
 * plugin is required. Icons are public-only and are not part of reference docs.
 */

var DEFAULT_KIBANA_URL = 'http://localhost:5601';
var STEP_DEFINITIONS_PATH = '/internal/workflows_extensions/step_definitions?includeDocs=true';
var POLL_INTERVAL_MS = 2000;
var MAX_POLL_ATTEMPTS = 90;

function getAuthHeader(username, password) {
  return 'Basic ' + Buffer.from(username + ':' + password, 'utf8').toString('base64');
}

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function stepRegistryLooksReady(baseUrl, authHeader) {
  var url = baseUrl.replace(/\/$/, '') + STEP_DEFINITIONS_PATH;
  return fetch(url, {
    headers: {
      Authorization: authHeader,
      'kbn-xsrf': 'true',
      'x-elastic-internal-origin': 'Kibana',
    },
  }).then(function (response) {
    if (!response.ok) {
      return false;
    }
    return response.json().then(function (body) {
      var steps = body.steps;
      if (!Array.isArray(steps) || steps.length === 0) {
        return false;
      }
      return steps.every(function (s) {
        return (
          typeof s.label === 'string' &&
          s.label.length > 0 &&
          typeof s.stepCategory === 'string' &&
          s.stepCategory.length > 0
        );
      });
    });
  });
}

function pollUntilReady(normalizedBase, authHeader, attempt) {
  if (attempt > MAX_POLL_ATTEMPTS) {
    return Promise.reject(
      new Error(
        'Timed out waiting for server extension step registrations (' +
          MAX_POLL_ATTEMPTS +
          ' attempts). Ensure Kibana started with workflows extensions enabled.'
      )
    );
  }
  return stepRegistryLooksReady(normalizedBase, authHeader)
    .catch(function () {
      return false;
    })
    .then(function (ready) {
      if (ready) {
        return true;
      }
      return delay(POLL_INTERVAL_MS).then(function () {
        return pollUntilReady(normalizedBase, authHeader, attempt + 1);
      });
    });
}

function main() {
  var baseUrl = process.env.KIBANA_URL || DEFAULT_KIBANA_URL;
  var username = process.env.KIBANA_USERNAME || 'elastic';
  var password = process.env.KIBANA_PASSWORD || 'changeme';
  var normalizedBase = baseUrl.replace(/\/$/, '');
  var authHeader = getAuthHeader(username, password);

  return pollUntilReady(normalizedBase, authHeader, 1).then(function () {
    console.log('Server extension step registry is ready for doc generation.');
  });
}

main().catch(function (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
