/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License, v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiToolTip } from '@elastic/eui';
import { selectUnit } from '@formatjs/intl-utils';
import moment from 'moment';
import React from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedRelativeTime } from '@kbn/i18n-react';
import { useFormattedDateTime } from '../../shared/ui/use_formatted_date';

const MIN_DAYS_FOR_YEAR_UNIT = 180;
const MIN_DAYS_FOR_MONTH_UNIT = 28;

export const InboundWebhookRelativeTime = ({ value: valueInput }: { value: string }) => {
  const valueDate = moment(valueInput).isValid() ? moment(valueInput).toDate() : new Date();
  let { value, unit } = selectUnit(valueDate, new Date());

  if (unit === 'year') {
    const diffDays = Math.abs(moment().diff(moment(valueDate), 'days'));
    if (diffDays < MIN_DAYS_FOR_YEAR_UNIT) {
      const isPast = value < 0;
      const diffMonths = Math.abs(moment().diff(moment(valueDate), 'months'));
      if (diffMonths >= 1) {
        value = isPast ? -diffMonths : diffMonths;
        unit = 'month';
      } else {
        const diffWeeks = Math.round(diffDays / 7);
        value = isPast ? -diffWeeks : diffWeeks;
        unit = 'week';
      }
    }
  }

  if (unit === 'month') {
    const diffDays = Math.abs(moment().diff(moment(valueDate), 'days'));
    if (diffDays < MIN_DAYS_FOR_MONTH_UNIT) {
      const isPast = value < 0;
      if (diffDays >= 7) {
        const diffWeeks = Math.round(diffDays / 7);
        value = isPast ? -diffWeeks : diffWeeks;
        unit = 'week';
      } else {
        value = isPast ? -diffDays : diffDays;
        unit = 'day';
      }
    }
  }

  const content =
    unit === 'second' ? (
      i18n.translate('inboundEvents.inboundWebhook.receivedEvents.justNow', {
        defaultMessage: 'just now',
      })
    ) : (
      <FormattedRelativeTime value={value} unit={unit} numeric="auto" />
    );

  return (
    <InboundWebhookRelativeTimeTooltip valueDate={valueDate}>
      {content}
    </InboundWebhookRelativeTimeTooltip>
  );
};

const InboundWebhookRelativeTimeTooltip = ({
  children,
  valueDate,
}: {
  children: React.ReactElement | string;
  valueDate: Date;
}) => {
  const fullDateFormatted = useFormattedDateTime(valueDate);

  return (
    <EuiToolTip content={fullDateFormatted} position="left">
      <span tabIndex={0}>{children}</span>
    </EuiToolTip>
  );
};
