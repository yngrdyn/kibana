/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiFormRow, EuiSwitch, EuiSwitchEvent } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import React, { Component } from 'react';
import type { LayoutParams } from '@kbn/screenshotting-plugin/common';
import { ReportingPanelContent, ReportingPanelProps } from './reporting_panel_content';

export interface Props extends Omit<ReportingPanelProps, 'theme'> {
  layoutOption?: 'canvas' | 'print';
}

interface State {
  usePrintLayout: boolean;
  useCanvasLayout: boolean;
}

export class ScreenCapturePanelContent extends Component<Props, State> {
  constructor(props: Props) {
    super(props);

    this.state = {
      usePrintLayout: false,
      useCanvasLayout: false,
    };
  }

  public render() {
    return (
      <ReportingPanelContent
        {...this.props}
        layoutId={this.getLayout().id}
        getJobParams={this.getJobParams}
        options={this.renderOptions()}
      />
    );
  }

  private renderOptions = () => {
    if (this.props.layoutOption === 'print') {
      return (
        <EuiFormRow
          helpText={
            <FormattedMessage
              id="reporting.share.screenCapturePanelContent.optimizeForPrintingHelpText"
              defaultMessage="Uses multiple pages, showing at most 2 visualizations per page"
            />
          }
        >
          <EuiSwitch
            label={
              <FormattedMessage
                id="reporting.share.screenCapturePanelContent.optimizeForPrintingLabel"
                defaultMessage="Optimize for printing"
              />
            }
            checked={this.state.usePrintLayout}
            onChange={this.handlePrintLayoutChange}
            data-test-subj="usePrintLayout"
          />
        </EuiFormRow>
      );
    }

    if (this.props.layoutOption === 'canvas') {
      return (
        <EuiFormRow
          helpText={
            <FormattedMessage
              id="reporting.share.screenCapturePanelContent.canvasLayoutHelpText"
              defaultMessage="Remove borders and footer logo"
            />
          }
        >
          <EuiSwitch
            label={
              <FormattedMessage
                id="reporting.share.screenCapturePanelContent.canvasLayoutLabel"
                defaultMessage="Full page layout"
              />
            }
            checked={this.state.useCanvasLayout}
            onChange={this.handleCanvasLayoutChange}
            data-test-subj="reportModeToggle"
          />
        </EuiFormRow>
      );
    }

    return null;
  };

  private handlePrintLayoutChange = (evt: EuiSwitchEvent) => {
    this.setState({ usePrintLayout: evt.target.checked, useCanvasLayout: false });
  };

  private handleCanvasLayoutChange = (evt: EuiSwitchEvent) => {
    this.setState({ useCanvasLayout: evt.target.checked, usePrintLayout: false });
  };

  private getLayout = (): LayoutParams => {
    const { layout: outerLayout } = this.props.getJobParams();

    let dimensions = outerLayout?.dimensions;
    if (!dimensions) {
      const el = document.querySelector('[data-shared-items-container]');
      const { height, width } = el ? el.getBoundingClientRect() : { height: 768, width: 1024 };
      dimensions = { height, width };
    }

    if (this.state.usePrintLayout) {
      return { id: 'print', dimensions };
    }

    if (this.state.useCanvasLayout) {
      return { id: 'canvas', dimensions };
    }

    return { id: 'preserve_layout', dimensions };
  };

  private getJobParams = () => {
    return {
      ...this.props.getJobParams(),
      layout: this.getLayout(),
    };
  };
}
