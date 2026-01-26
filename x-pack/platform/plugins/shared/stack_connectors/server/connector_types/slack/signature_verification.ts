/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { Logger } from '@kbn/core/server';

/**
 * Verifies a Slack Events API request signature.
 * 
 * Slack signs requests using HMAC-SHA256 with the format: v0={hash}
 * where hash is HMAC-SHA256 of "v0:{timestamp}:{body}" using the signing secret.
 * 
 * @param signature - The X-Slack-Signature header value
 * @param timestamp - The X-Slack-Request-Timestamp header value
 * @param body - The raw request body as a string
 * @param signingSecret - The Slack app signing secret
 * @param logger - Logger instance for error logging
 * @returns true if signature is valid, false otherwise
 */
export function verifySlackSignature(
  signature: string | undefined,
  timestamp: string | undefined,
  body: string,
  signingSecret: string,
  logger: Logger
): boolean {
  if (!signature || !timestamp) {
    logger.warn('Missing Slack signature or timestamp headers');
    return false;
  }

  // Check timestamp to prevent replay attacks (5 minute window)
  const requestTimestamp = parseInt(timestamp, 10);
  if (isNaN(requestTimestamp)) {
    logger.warn('Invalid timestamp format in X-Slack-Request-Timestamp');
    return false;
  }

  const currentTimestamp = Math.floor(Date.now() / 1000);
  const timeDifference = Math.abs(currentTimestamp - requestTimestamp);
  const fiveMinutesInSeconds = 5 * 60;

  if (timeDifference > fiveMinutesInSeconds) {
    logger.warn(
      `Request timestamp is too old: ${timeDifference}s difference (max: ${fiveMinutesInSeconds}s)`
    );
    return false;
  }

  // Extract signature hash (format: v0={hash})
  if (!signature.startsWith('v0=')) {
    logger.warn(`Invalid signature format: expected v0= prefix, got ${signature.substring(0, 10)}`);
    return false;
  }

  const signatureHash = signature.substring(3); // Remove 'v0=' prefix

  // Compute expected signature
  const signatureBaseString = `v0:${timestamp}:${body}`;
  const expectedHash = createHmac('sha256', signingSecret)
    .update(signatureBaseString)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  if (signatureHash.length !== expectedHash.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(signatureHash), Buffer.from(expectedHash));
  } catch (error) {
    logger.error(`Error during signature comparison: ${error}`);
    return false;
  }
}
