/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import PropTypes from 'prop-types';
import React, { Component, useState, useEffect } from 'react';

import { EuiDatePicker, EuiFieldText, EuiSpacer, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';

import moment from 'moment';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { TIME_FORMAT } from '@kbn/ml-date-utils';
import { ManagedJobsWarningCallout } from '../../confirm_modals/managed_jobs_warning_callout';
import { TimeRangeSelectorWrapper } from './time_range_selector_wrapper';

export class TimeRangeSelector extends Component {
  constructor(props) {
    super(props);

    this.state = {
      startTab: 0,
      endTab: 1,
    };
    this.latestTimestamp = this.props.startTime;
    this.now = this.props.now;
    this.twoWeeksAgo = moment(this.now).subtract(2, 'weeks').startOf('day');
  }

  setStartTab = (tab) => {
    this.setState({ startTab: tab });
    switch (tab) {
      case 0:
        this.setStartTime(undefined);
        break;
      case 1:
        this.setStartTime(this.now);
        break;
      case 2:
        this.setStartTime(this.twoWeeksAgo);
        break;
      default:
        break;
    }
  };

  setEndTab = (tab) => {
    this.setState({ endTab: tab });
    switch (tab) {
      case 0:
        this.setEndTime(undefined);
        break;
      case 1:
        this.setEndTime(this.now);
        break;
      default:
        break;
    }
  };

  setStartTime = (time) => {
    this.props.setStartTime(time);
  };

  setEndTime = (time) => {
    this.props.setEndTime(time);
  };

  getTabItems() {
    const datePickerTimes = {
      start: moment.isMoment(this.props.startTime) ? this.props.startTime : this.latestTimestamp,
      end: moment.isMoment(this.props.endTime) ? this.props.endTime : this.now,
    };
    const formattedLatestStartTime = this.latestTimestamp.format(TIME_FORMAT);

    // Show different labels for the start time depending on whether
    // the job has seen any data yet
    const showContinueLabels = this.latestTimestamp.valueOf() > 0;
    const startLabels =
      showContinueLabels === true
        ? [
            <FormattedMessage
              id="xpack.ml.jobsList.startDatafeedModal.continueFromStartTimeLabel"
              defaultMessage="Continue from {formattedLatestStartTime}"
              values={{ formattedLatestStartTime }}
            />,
            <FormattedMessage
              id="xpack.ml.jobsList.startDatafeedModal.continueFromNowLabel"
              defaultMessage="Continue from now"
            />,
            <FormattedMessage
              id="xpack.ml.jobsList.startDatafeedModal.continueFromSpecifiedTimeLabel"
              defaultMessage="Continue from specified time"
            />,
          ]
        : [
            <FormattedMessage
              id="xpack.ml.jobsList.startDatafeedModal.startAtBeginningOfDataLabel"
              defaultMessage="Start at beginning of data"
            />,
            <FormattedMessage
              id="xpack.ml.jobsList.startDatafeedModal.startFromNowLabel"
              defaultMessage="Start from now"
            />,
            <FormattedMessage
              id="xpack.ml.jobsList.startDatafeedModal.specifyStartTimeLabel"
              defaultMessage="Specify start time"
            />,
          ];

    const startItems = [
      { index: 0, label: startLabels[0] },
      { index: 1, label: startLabels[1] },
      {
        index: 2,
        label: startLabels[2],
        body: (
          // eslint-disable-next-line no-use-before-define
          <DatePickerWithInput
            date={datePickerTimes.start}
            onChange={this.setStartTime}
            maxDate={datePickerTimes.end}
            setIsValid={this.props.setTimeRangeValid}
            tab={this.state.startTab}
          />
        ),
      },
    ];
    const endItems = [
      {
        index: 0,
        label: (
          <FormattedMessage
            id="xpack.ml.jobsList.startDatafeedModal.noEndTimeLabel"
            defaultMessage="No end time (Real-time search)"
          />
        ),
      },
      {
        index: 1,
        label: (
          <FormattedMessage
            id="xpack.ml.jobsList.startDatafeedModal.specifyEndTimeLabel"
            defaultMessage="Specify end time"
          />
        ),
        body: (
          // eslint-disable-next-line no-use-before-define
          <DatePickerWithInput
            date={datePickerTimes.end}
            onChange={this.setEndTime}
            minDate={datePickerTimes.start}
            setIsValid={this.props.setTimeRangeValid}
            tab={this.state.endTab}
          />
        ),
      },
    ];
    return {
      startItems,
      endItems,
    };
  }

  render() {
    const { startItems, endItems } = this.getTabItems();
    return (
      <TimeRangeSelectorWrapper>
        {this.props.hasManagedJob === true && this.state.endTab !== 0 ? (
          <>
            <ManagedJobsWarningCallout
              jobsCount={this.props.jobsCount}
              message={i18n.translate(
                'xpack.ml.jobsList.startDatafeedsModal.startManagedDatafeedsDescription',
                {
                  defaultMessage:
                    '{jobsCount, plural, one {This job} other {At least one of these jobs}} is preconfigured by Elastic; starting {jobsCount, plural, one {it} other {them}} with a specific end time might impact other parts of the product.',
                  values: {
                    jobsCount: this.props.jobsCount,
                  },
                }
              )}
            />
            <EuiSpacer />
          </>
        ) : null}
        <EuiFlexGroup gutterSize="s">
          <EuiFlexItem>
            <TabStack
              title={
                <FormattedMessage
                  id="xpack.ml.jobsList.startDatafeedModal.searchStartTimeTitle"
                  defaultMessage="Search start time"
                />
              }
              items={startItems}
              switchState={this.state.startTab}
              switchFunc={this.setStartTab}
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <TabStack
              title={
                <FormattedMessage
                  id="xpack.ml.jobsList.startDatafeedModal.searchEndTimeTitle"
                  defaultMessage="Search end time"
                />
              }
              items={endItems}
              switchState={this.state.endTab}
              switchFunc={this.setEndTab}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </TimeRangeSelectorWrapper>
    );
  }
}

function TabStack({ title, items, switchState, switchFunc }) {
  return (
    <div className="time-range-section">
      <div className="time-range-section-title">{title}</div>
      <ul className="tab-stack">
        {items.map((item, i) => {
          let className = '';
          if (switchState === item.index) {
            className += 'active ';
          }
          if (item.body !== undefined) {
            className += 'has-body ';
          }

          return (
            <li key={i} className={className}>
              <a onClick={() => switchFunc(item.index)} onKeyUp={() => {}}>
                {item.label}
              </a>
              {item.body !== undefined && <div className="body">{item.body}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const DatePickerWithInput = ({ date, onChange, minDate, setIsValid, tab }) => {
  const [dateString, setDateString] = useState(date.format(TIME_FORMAT));
  const [currentTab, setCurrentTab] = useState(tab);

  useEffect(() => {
    if (currentTab !== tab) {
      // if the tab has changed, reset the text to be the same as the date prop
      setDateString(date.format(TIME_FORMAT));
      setCurrentTab(tab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function onTextChange(e) {
    const val = e.target.value;
    setDateString(val);

    const newDate = moment(val);
    if (newDate.isValid()) {
      setIsValid(true);
      onChange(newDate);
    } else {
      setIsValid(false);
    }
  }

  function onCalendarChange(newDate) {
    setDateString(newDate.format(TIME_FORMAT));
    setIsValid(true);
    onChange(newDate);
  }

  return (
    <>
      <EuiFieldText
        value={dateString}
        onChange={onTextChange}
        placeholder={TIME_FORMAT}
        aria-label={i18n.translate('xpack.ml.jobsList.startDatafeedModal.enterDateText"', {
          defaultMessage: 'Enter date',
        })}
      />
      <EuiDatePicker
        selected={date}
        onChange={onCalendarChange}
        minDate={minDate}
        inline
        showTimeSelect
      />
    </>
  );
};

TimeRangeSelector.propTypes = {
  startTime: PropTypes.object.isRequired,
  endTime: PropTypes.object,
  setStartTime: PropTypes.func.isRequired,
  setEndTime: PropTypes.func.isRequired,
};
