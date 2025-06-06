/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreSetup } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import { migrateToLatest } from '@kbn/kibana-utils-plugin/common';
import type { Location } from 'history';
import { BehaviorSubject } from 'rxjs';
import type { UrlService } from '../../../common/url_service';
import {
  LEGACY_SHORT_URL_LOCATOR_ID,
  LegacyShortUrlLocatorParams,
} from '../../../common/url_service/locators/legacy_short_url_locator';
import { parseSearchParams, RedirectOptions } from '../../../common/url_service/locators/redirect';
import { getHomeHref } from '../../lib/get_home_href';

export interface RedirectManagerDependencies {
  url: UrlService;
}

export class RedirectManager {
  public readonly error$ = new BehaviorSubject<null | Error>(null);

  constructor(public readonly deps: RedirectManagerDependencies) {}

  public registerLocatorRedirectApp(core: CoreSetup) {
    const { application, customBranding, http, theme } = core;

    application.register({
      id: 'r',
      title: 'Redirect endpoint',
      visibleIn: [],
      mount: async (params) => {
        const abortController = new AbortController();
        this.onMount(params.history.location, abortController.signal);

        const { render } = await import('./render');
        const [start] = await core.getStartServices();
        const { chrome, uiSettings, userProfile } = start;

        const unmount = render(params.element, {
          manager: this,
          customBranding,
          docTitle: chrome.docTitle,
          theme,
          userProfile,
          homeHref: getHomeHref(http, uiSettings),
        });

        return () => {
          abortController.abort();
          unmount();
        };
      },
    });
  }

  public registerLegacyShortUrlRedirectApp(core: CoreSetup) {
    core.application.register({
      id: 'short_url_redirect',
      appRoute: '/goto',
      title: 'Short URL Redirect',
      chromeless: true,
      mount: async () => {
        const urlId = location.pathname.match(new RegExp(`/goto/(.*)$`))?.[1];
        if (!urlId) throw new Error('Url id not present in path');
        const urlService = this.deps.url;
        const shortUrls = urlService.shortUrls.get(null);
        const shortUrl = await shortUrls.get(urlId);
        const locatorId = shortUrl.data.locator.id;
        const locator = urlService.locators.get(locatorId);
        if (!locator) throw new Error(`Locator [id = ${locatorId}] not found.`);
        const locatorState = shortUrl.data.locator.state;
        if (shortUrl.data.locator.id !== LEGACY_SHORT_URL_LOCATOR_ID) {
          await locator.navigate(locatorState, { replace: true });
          return () => {};
        }
        let redirectUrl = (locatorState as LegacyShortUrlLocatorParams).url;
        const storeInSessionStorage = core.uiSettings.get('state:storeInSessionStorage');
        if (storeInSessionStorage) {
          const { hashUrl } = await import('@kbn/kibana-utils-plugin/public');
          redirectUrl = hashUrl(redirectUrl);
        }

        const url = core.http.basePath.prepend(redirectUrl);
        if (!core.http.externalUrl.isInternalUrl(url)) {
          throw new Error(`Can not redirect to external URL: ${url}`);
        }

        location.href = url;
        return () => {};
      },
    });
  }

  public onMount(location: Location, abortSignal?: AbortSignal) {
    const pathname = location.pathname;
    const isShortUrlRedirectBySlug = pathname.startsWith('/s/');
    if (isShortUrlRedirectBySlug) {
      this.navigateToShortUrlBySlug(pathname.substring('/s/'.length), abortSignal);
      return;
    }
    const urlLocationSearch = location.search;
    const options = this.parseSearchParams(urlLocationSearch);
    this.navigate(options);
  }

  private navigateToShortUrlBySlug(slug: string, abortSignal?: AbortSignal) {
    (async () => {
      const urlService = this.deps.url;
      const shortUrls = urlService.shortUrls.get(null);
      const shortUrl = await shortUrls.resolve(slug);

      if (abortSignal?.aborted)
        return; /* it means that the user navigated away before the short url resolved */

      const locatorId = shortUrl.data.locator.id;
      const locator = urlService.locators.get(locatorId);
      if (!locator) throw new Error(`Locator "${locatorId}" not found.`);
      const locatorState = shortUrl.data.locator.state;
      await locator.navigate(locatorState, { replace: true });
    })().catch((error) => {
      if (abortSignal?.aborted) return;

      this.error$.next(error);
      // eslint-disable-next-line no-console
      console.error(error);
    });
  }

  public navigate(options: RedirectOptions) {
    const locator = this.deps.url.locators.get(options.id);

    if (!locator) {
      const message = i18n.translate('share.urlService.redirect.RedirectManager.locatorNotFound', {
        defaultMessage: 'Locator [ID = {id}] does not exist.',
        values: {
          id: options.id,
        },
        description:
          'Error displayed to user in redirect endpoint when redirection cannot be performed successfully, because locator does not exist.',
      });
      const error = new Error(message);
      this.error$.next(error);
      throw error;
    }

    const locatorMigrations =
      typeof locator.migrations === 'function' ? locator.migrations() : locator.migrations;
    const migratedParams = migrateToLatest(locatorMigrations, {
      state: options.params,
      version: options.version,
    });

    locator
      .navigate(migratedParams, {
        replace: true, // We do not want the redirect app URL to appear in browser navigation history
      })
      .then()
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.log('Redirect endpoint failed to execute locator redirect.');
        // eslint-disable-next-line no-console
        console.error(error);
      });
  }

  protected parseSearchParams(urlLocationSearch: string): RedirectOptions {
    try {
      return parseSearchParams(urlLocationSearch);
    } catch (error) {
      this.error$.next(error);
      throw error;
    }
  }
}
