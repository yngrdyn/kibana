/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

import type { User } from '../../../common';

export const isUserReserved = (user: User) => user.metadata?._reserved ?? false;

export const isUserDeprecated = (user: User) => user.metadata?._deprecated ?? false;

export const getExtendedUserDeprecationNotice = (user: User) => {
  const reason = user.metadata?._deprecated_reason ?? '';
  return i18n.translate('xpack.security.management.users.extendedUserDeprecationNotice', {
    defaultMessage: `The {username} user is deprecated. {reason}`,
    values: {
      username: user.username,
      reason,
    },
  });
};
