/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import {
  BehaviorSubject,
  combineLatest,
  filter,
  map,
  merge,
  mergeMap,
  type Observable,
  of,
  ReplaySubject,
  takeUntil,
} from 'rxjs';
import { parse } from 'url';
import { setEuiDevProviderWarning } from '@elastic/eui';
import useObservable from 'react-use/lib/useObservable';
import type { I18nStart } from '@kbn/core-i18n-browser';
import type { ThemeServiceStart } from '@kbn/core-theme-browser';
import type { UserProfileService } from '@kbn/core-user-profile-browser';
import type { IUiSettingsClient } from '@kbn/core-ui-settings-browser';

import type { CoreContext } from '@kbn/core-base-browser-internal';
import type { InternalInjectedMetadataStart } from '@kbn/core-injected-metadata-browser-internal';
import type { AnalyticsServiceSetup, AnalyticsServiceStart } from '@kbn/core-analytics-browser';
import { type DocLinksStart } from '@kbn/core-doc-links-browser';
import type { InternalHttpStart } from '@kbn/core-http-browser-internal';
import { mountReactNode } from '@kbn/core-mount-utils-browser-internal';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
import type { InternalApplicationStart } from '@kbn/core-application-browser-internal';
import type {
  AppDeepLinkId,
  ChromeBadge,
  ChromeBreadcrumb,
  ChromeBreadcrumbsAppendExtension,
  ChromeGlobalHelpExtensionMenuLink,
  ChromeHelpExtension,
  ChromeHelpMenuLink,
  ChromeNavLink,
  ChromeSetBreadcrumbsParams,
  ChromeSetProjectBreadcrumbsParams,
  ChromeStyle,
  ChromeUserBanner,
  NavigationTreeDefinition,
  SolutionId,
} from '@kbn/core-chrome-browser';
import type { CustomBrandingStart } from '@kbn/core-custom-branding-browser';
import { RecentlyAccessedService } from '@kbn/recently-accessed';
import { Logger } from '@kbn/logging';
import { Router } from '@kbn/shared-ux-router';
import { isPrinting$ } from './utils/printing_observable';
import { DocTitleService } from './doc_title';
import { NavControlsService } from './nav_controls';
import { NavLinksService } from './nav_links';
import { ProjectNavigationService } from './project_navigation';
import { Header, LoadingIndicator, ProjectHeader } from './ui';
import { registerAnalyticsContextProvider } from './register_analytics_context_provider';
import type { InternalChromeStart } from './types';
import { HeaderTopBanner } from './ui/header/header_top_banner';
import { handleSystemColorModeChange } from './handle_system_colormode_change';
import { AppMenuBar } from './ui/project/app_menu';
import { ProjectSideNavV1 } from './ui/project/sidenav_v1/sidenav';
import { GridLayoutProjectSideNavV2 } from './ui/project/sidenav_v2/grid_layout_sidenav';
import { FixedLayoutProjectSideNavV2 } from './ui/project/sidenav_v2/fixed_layout_sidenav';
import { SideNavV2CollapseButton } from './ui/project/sidenav_v2/collapse_button';

const IS_SIDENAV_COLLAPSED_KEY = 'core.chrome.isSideNavCollapsed';
const SNAPSHOT_REGEX = /-snapshot/i;

interface ConstructorParams {
  browserSupportsCsp: boolean;
  kibanaVersion: string;
  coreContext: CoreContext;
}

export interface SetupDeps {
  analytics: AnalyticsServiceSetup;
}

export interface StartDeps {
  application: InternalApplicationStart;
  docLinks: DocLinksStart;
  http: InternalHttpStart;
  injectedMetadata: InternalInjectedMetadataStart;
  notifications: NotificationsStart;
  customBranding: CustomBrandingStart;
  i18n: I18nStart;
  theme: ThemeServiceStart;
  userProfile: UserProfileService;
  uiSettings: IUiSettingsClient;
  analytics: AnalyticsServiceStart;
}

/** @internal */
export class ChromeService {
  private isVisible$!: Observable<boolean>;
  private isForceHidden$!: BehaviorSubject<boolean>;
  private readonly stop$ = new ReplaySubject<void>(1);
  private readonly navControls = new NavControlsService();
  private readonly navLinks = new NavLinksService();
  private readonly recentlyAccessed = new RecentlyAccessedService();
  private readonly docTitle = new DocTitleService();
  private readonly projectNavigation: ProjectNavigationService;
  private mutationObserver: MutationObserver | undefined;
  private readonly isSideNavCollapsed$ = new BehaviorSubject(
    localStorage.getItem(IS_SIDENAV_COLLAPSED_KEY) === 'true'
  );
  private readonly isFeedbackBtnVisible$ = new BehaviorSubject(false);
  private logger: Logger;
  private isServerless = false;

  constructor(private readonly params: ConstructorParams) {
    this.logger = params.coreContext.logger.get('chrome-browser');
    this.isServerless = params.coreContext.env.packageInfo.buildFlavor === 'serverless';
    this.projectNavigation = new ProjectNavigationService(this.isServerless);
  }

  /**
   * These observables allow consumers to toggle the chrome visibility via either:
   *   1. Using setIsVisible() to trigger the next chromeHidden$
   *   2. Setting `chromeless` when registering an application, which will
   *      reset the visibility whenever the next application is mounted
   *   3. Having "embed" in the query string
   */
  private initVisibility(application: StartDeps['application']) {
    // Start off the chrome service hidden if "embed" is in the hash query string.
    const isEmbedded = 'embed' in parse(location.hash.slice(1), true).query;
    this.isForceHidden$ = new BehaviorSubject(isEmbedded);

    const appHidden$ = merge(
      // For the isVisible$ logic, having no mounted app is equivalent to having a hidden app
      // in the sense that the chrome UI should not be displayed until a non-chromeless app is mounting or mounted
      of(true),
      application.currentAppId$.pipe(
        mergeMap((appId) =>
          application.applications$.pipe(
            map((applications) => {
              return !!appId && applications.has(appId) && !!applications.get(appId)!.chromeless;
            })
          )
        )
      )
    );
    this.isVisible$ = combineLatest([appHidden$, this.isForceHidden$, isPrinting$]).pipe(
      map(([appHidden, forceHidden, isPrinting]) => !appHidden && !forceHidden && !isPrinting),
      takeUntil(this.stop$)
    );
  }

  private setIsVisible = (isVisible: boolean) => this.isForceHidden$.next(!isVisible);

  /**
   * Some EUI component can be toggled in Full screen (e.g. the EuiDataGrid). When they are toggled in full
   * screen we want to hide the chrome, and when they are toggled back to normal we want to show the chrome.
   */
  private handleEuiFullScreenChanges = () => {
    const { body } = document;
    // HTML class names that are added to the body when Eui components are toggled in full screen
    const classesOnBodyWhenEuiFullScreen = ['euiDataGrid__restrictBody'];

    let isChromeHiddenForEuiFullScreen = false;
    let isChromeVisible = false;

    this.isVisible$.pipe(takeUntil(this.stop$)).subscribe((isVisible) => {
      isChromeVisible = isVisible;
    });

    const onBodyClassesChange = () => {
      const { className } = body;
      if (
        classesOnBodyWhenEuiFullScreen.some((name) => className.includes(name)) &&
        isChromeVisible
      ) {
        isChromeHiddenForEuiFullScreen = true;
        this.setIsVisible(false);
      } else if (
        classesOnBodyWhenEuiFullScreen.every((name) => !className.includes(name)) &&
        !isChromeVisible &&
        isChromeHiddenForEuiFullScreen
      ) {
        isChromeHiddenForEuiFullScreen = false;
        this.setIsVisible(true);
      }
    };

    this.mutationObserver = new MutationObserver((mutationList) => {
      mutationList.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          onBodyClassesChange();
        }
      });
    });

    this.mutationObserver.observe(body, { attributes: true });
  };

  // Ensure developers are notified if working in a context that lacks the EUI Provider.
  // @ts-expect-error
  private handleEuiDevProviderWarning = (notifications: NotificationsStart) => {
    const isDev = this.params.coreContext.env.mode.name === 'development';
    if (isDev) {
      setEuiDevProviderWarning((providerError) => {
        const errorObject = new Error(providerError.toString());
        // 1. show a stack trace in the console
        // eslint-disable-next-line no-console
        console.error(errorObject);

        // 2. store error in sessionStorage so it can be detected in testing
        const storedError = {
          message: providerError.toString(),
          stack: errorObject.stack ?? 'undefined',
          pageHref: window.location.href,
          pageTitle: document.title,
        };
        sessionStorage.setItem('dev.euiProviderWarning', JSON.stringify(storedError));

        // 3. error toast / popup
        notifications.toasts.addDanger({
          title: '`EuiProvider` is missing',
          text: mountReactNode(
            <p>
              <FormattedMessage
                id="core.chrome.euiDevProviderWarning"
                defaultMessage="Kibana components must be wrapped in a React Context provider for full functionality and proper theming support. See {link}."
                values={{
                  link: (
                    <a href="https://docs.elastic.dev/kibana-dev-docs/react-context">
                      https://docs.elastic.dev/kibana-dev-docs/react-context
                    </a>
                  ),
                }}
              />
            </p>
          ),
          'data-test-subj': 'core-chrome-euiDevProviderWarning-toast',
          toastLifeTimeMs: 60 * 60 * 1000, // keep message visible for up to an hour
        });
      });
    }
  };

  public setup({ analytics }: SetupDeps) {
    const docTitle = this.docTitle.setup({ document: window.document });
    registerAnalyticsContextProvider(analytics, docTitle.title$);
  }

  public async start({
    application,
    docLinks,
    http,
    injectedMetadata,
    notifications,
    customBranding,
    i18n: i18nService,
    theme,
    userProfile,
    uiSettings,
    analytics,
  }: StartDeps): Promise<InternalChromeStart> {
    this.initVisibility(application);
    this.handleEuiFullScreenChanges();

    handleSystemColorModeChange({
      notifications,
      coreStart: { i18n: i18nService, theme, userProfile },
      stop$: this.stop$,
      http,
      uiSettings,
    });
    // commented out until https://github.com/elastic/kibana/issues/201805 can be fixed
    // this.handleEuiDevProviderWarning(notifications);

    const globalHelpExtensionMenuLinks$ = new BehaviorSubject<ChromeGlobalHelpExtensionMenuLink[]>(
      []
    );
    const helpExtension$ = new BehaviorSubject<ChromeHelpExtension | undefined>(undefined);
    const breadcrumbs$ = new BehaviorSubject<ChromeBreadcrumb[]>([]);
    const breadcrumbsAppendExtensions$ = new BehaviorSubject<ChromeBreadcrumbsAppendExtension[]>(
      []
    );
    const badge$ = new BehaviorSubject<ChromeBadge | undefined>(undefined);
    const customNavLink$ = new BehaviorSubject<ChromeNavLink | undefined>(undefined);
    const helpSupportUrl$ = new BehaviorSubject<string>(docLinks.links.kibana.askElastic);
    // ChromeStyle is set to undefined by default, which means that no header will be rendered until
    // setChromeStyle(). This is to avoid a flickering between the "classic" and "project" header meanwhile
    // we load the user profile to check if the user opted out of the new solution navigation.
    const chromeStyleSubject$ = new BehaviorSubject<ChromeStyle | undefined>(undefined);

    const getKbnVersionClass = () => {
      // we assume that the version is valid and has the form 'X.X.X'
      // strip out `SNAPSHOT` and reformat to 'X-X-X'
      const formattedVersionClass = this.params.kibanaVersion
        .replace(SNAPSHOT_REGEX, '')
        .split('.')
        .join('-');
      return `kbnVersion-${formattedVersionClass}`;
    };

    const chromeStyle$ = chromeStyleSubject$.pipe(
      filter((style): style is ChromeStyle => style !== undefined),
      takeUntil(this.stop$)
    );
    const setChromeStyle = (style: ChromeStyle) => {
      if (style === chromeStyleSubject$.getValue()) return;
      chromeStyleSubject$.next(style);
    };

    const headerBanner$ = new BehaviorSubject<ChromeUserBanner | undefined>(undefined);
    const bodyClasses$ = combineLatest([
      headerBanner$,
      this.isVisible$!,
      chromeStyleSubject$,
      application.currentActionMenu$,
    ]).pipe(
      map(([headerBanner, isVisible, chromeStyle, actionMenu]) => {
        return [
          'kbnBody',
          headerBanner ? 'kbnBody--hasHeaderBanner' : 'kbnBody--noHeaderBanner',
          isVisible ? 'kbnBody--chromeVisible' : 'kbnBody--chromeHidden',
          chromeStyle === 'project' && actionMenu ? 'kbnBody--hasProjectActionMenu' : '',
          getKbnVersionClass(),
        ].filter((className) => !!className);
      })
    );

    const navControls = this.navControls.start();
    const navLinks = this.navLinks.start({ application, http });
    const projectNavigation = this.projectNavigation.start({
      application,
      navLinksService: navLinks,
      http,
      chromeBreadcrumbs$: breadcrumbs$,
      logger: this.logger,
    });
    const recentlyAccessed = this.recentlyAccessed.start({ http, key: 'recentlyAccessed' });
    const docTitle = this.docTitle.start();
    const { customBranding$ } = customBranding;
    const helpMenuLinks$ = navControls.getHelpMenuLinks$();

    // erase chrome fields from a previous app while switching to a next app
    application.currentAppId$.subscribe(() => {
      helpExtension$.next(undefined);
      breadcrumbs$.next([]);
      badge$.next(undefined);
      docTitle.reset();
    });

    const validateChromeStyle = () => {
      const chromeStyle = chromeStyleSubject$.getValue();
      if (chromeStyle !== 'project') {
        // Helps ensure callers go through the serverless plugin to get here.
        throw new Error(
          `Invalid ChromeStyle value of "${chromeStyle}". This method requires ChromeStyle set to "project".`
        );
      }
    };

    function initProjectNavigation<
      LinkId extends AppDeepLinkId = AppDeepLinkId,
      Id extends string = string,
      ChildrenId extends string = Id
    >(
      id: SolutionId,
      navigationTree$: Observable<NavigationTreeDefinition<LinkId, Id, ChildrenId>>,
      config?: { dataTestSubj?: string }
    ) {
      validateChromeStyle();
      projectNavigation.initNavigation(id, navigationTree$, config);
    }

    const setProjectBreadcrumbs = (
      breadcrumbs: ChromeBreadcrumb[] | ChromeBreadcrumb,
      params?: ChromeSetProjectBreadcrumbsParams
    ) => {
      projectNavigation.setProjectBreadcrumbs(breadcrumbs, params);
    };

    const setClassicBreadcrumbs = (
      newBreadcrumbs: ChromeBreadcrumb[],
      { project }: ChromeSetBreadcrumbsParams = {}
    ) => {
      breadcrumbs$.next(newBreadcrumbs);
      if (project) {
        const { value: projectValue, absolute = false } = project;
        setProjectBreadcrumbs(projectValue ?? [], { absolute });
      }
    };

    const setProjectHome = (homeHref: string) => {
      validateChromeStyle();
      projectNavigation.setProjectHome(homeHref);
    };

    const setProjectName = (projectName: string) => {
      validateChromeStyle();
      projectNavigation.setProjectName(projectName);
    };

    const setIsSideNavCollapsed = (isCollapsed: boolean) => {
      localStorage.setItem(IS_SIDENAV_COLLAPSED_KEY, JSON.stringify(isCollapsed));
      this.isSideNavCollapsed$.next(isCollapsed);
    };

    if (!this.params.browserSupportsCsp && injectedMetadata.getCspConfig().warnLegacyBrowsers) {
      notifications.toasts.addWarning({
        title: mountReactNode(
          <FormattedMessage
            id="core.chrome.legacyBrowserWarning"
            defaultMessage="Your browser does not meet the security requirements for Kibana."
          />
        ),
      });
    }

    /**
     * Classic header is a header for the "classic" navigation with all solutions
     * It can be customized to be used with either legacy fixed layout or new grid layout.
     * In fixed layout it is fixed to the top of the page, with display: fixed; and should be responsible for rendering the banner
     *
     * @param isFixed
     * @param includeBanner
     */
    const getClassicHeader = ({
      isFixed,
      includeBanner,
    }: {
      /**
       * Whether the header should be fixed to the top of the page, with display: fixed;
       */
      isFixed: boolean;
      /**
       * Whether the header should be also responsible the top banner, which is displayed above the header
       */
      includeBanner: boolean;
    }) => (
      <Header
        /* customizable header variations */
        headerBanner$={includeBanner ? headerBanner$.pipe(takeUntil(this.stop$)) : null}
        isFixed={isFixed}
        /* consistent header properties */
        isServerless={this.isServerless}
        loadingCount$={http.getLoadingCount$()}
        application={application}
        badge$={badge$.pipe(takeUntil(this.stop$))}
        basePath={http.basePath}
        breadcrumbs$={breadcrumbs$.pipe(takeUntil(this.stop$))}
        breadcrumbsAppendExtensions$={breadcrumbsAppendExtensions$.pipe(takeUntil(this.stop$))}
        customNavLink$={customNavLink$.pipe(takeUntil(this.stop$))}
        kibanaDocLink={docLinks.links.kibana.guide}
        docLinks={docLinks}
        forceAppSwitcherNavigation$={navLinks.getForceAppSwitcherNavigation$()}
        globalHelpExtensionMenuLinks$={globalHelpExtensionMenuLinks$}
        helpExtension$={helpExtension$.pipe(takeUntil(this.stop$))}
        helpSupportUrl$={helpSupportUrl$.pipe(takeUntil(this.stop$))}
        helpMenuLinks$={helpMenuLinks$}
        homeHref={http.basePath.prepend('/app/home')}
        kibanaVersion={injectedMetadata.getKibanaVersion()}
        navLinks$={navLinks.getNavLinks$()}
        recentlyAccessed$={recentlyAccessed.get$()}
        navControlsLeft$={navControls.getLeft$()}
        navControlsCenter$={navControls.getCenter$()}
        navControlsRight$={navControls.getRight$()}
        navControlsExtension$={navControls.getExtension$()}
        customBranding$={customBranding$}
      />
    );

    // create observables once here to avoid re-renders, TODO: do it for everything else
    const navLinks$ = navLinks.getNavLinks$();
    const activeNodes$ = projectNavigation.getActiveNodes$();
    const navigationTreeUi$ = projectNavigation.getNavigationTreeUi$();
    const panelSelectedNode$ = projectNavigation.getPanelSelectedNode$();
    const loadingCount$ = http.getLoadingCount$();
    const recentlyAccessed$ = recentlyAccessed.get$();
    const activeDataTestSubj$ = projectNavigation.getActiveDataTestSubj$();

    const getProjectHeader = ({
      includeSideNav,
      isFixed,
      includeBanner,
      includeAppMenu,
    }: {
      /**
       * Whether the header should be fixed to the top of the page, with display: fixed;
       */
      isFixed: boolean;
      /**
       * Whether the header should be also responsible the top banner, which is displayed above the header
       */
      includeBanner: boolean;

      /**
       * Whether the header should include a side navigation and which version of it.
       */
      includeSideNav: false | 'v1' | 'v2';

      /**
       * Whether the header should include the application subheader
       */
      includeAppMenu: boolean;
    }) => (
      <ProjectHeader
        isServerless={this.isServerless}
        isFixed={isFixed}
        application={application}
        globalHelpExtensionMenuLinks$={globalHelpExtensionMenuLinks$}
        actionMenu$={includeAppMenu ? application.currentActionMenu$ : null}
        breadcrumbs$={projectNavigation.getProjectBreadcrumbs$().pipe(takeUntil(this.stop$))}
        breadcrumbsAppendExtensions$={breadcrumbsAppendExtensions$.pipe(takeUntil(this.stop$))}
        customBranding$={customBranding$}
        helpExtension$={helpExtension$.pipe(takeUntil(this.stop$))}
        helpSupportUrl$={helpSupportUrl$.pipe(takeUntil(this.stop$))}
        helpMenuLinks$={helpMenuLinks$}
        navControlsLeft$={navControls.getLeft$()}
        navControlsCenter$={navControls.getCenter$()}
        navControlsRight$={navControls.getRight$()}
        loadingCount$={http.getLoadingCount$()}
        headerBanner$={includeBanner ? headerBanner$.pipe(takeUntil(this.stop$)) : null}
        homeHref$={projectNavigation.getProjectHome$()}
        docLinks={docLinks}
        kibanaVersion={injectedMetadata.getKibanaVersion()}
        prependBasePath={http.basePath.prepend}
      >
        <Router history={application.history}>
          <>
            {includeSideNav === 'v1' && (
              <ProjectSideNavV1
                isCollapsed$={this.isSideNavCollapsed$}
                toggle={setIsSideNavCollapsed}
                navigationTree$={navigationTreeUi$}
                navigateToUrl={application.navigateToUrl}
                navLinks$={navLinks$}
                activeNodes$={activeNodes$}
                recentlyAccessed$={recentlyAccessed$}
                basePath={http.basePath}
                isFeedbackBtnVisible$={this.isFeedbackBtnVisible$}
                panelSelectedNode$={panelSelectedNode$}
                setPanelSelectedNode={projectNavigation.setPanelSelectedNode}
                loadingCount$={loadingCount$}
                reportEvent={analytics.reportEvent}
                dataTestSubj$={activeDataTestSubj$}
              />
            )}

            {includeSideNav === 'v2' && (
              <FixedLayoutProjectSideNavV2
                isCollapsed$={this.isSideNavCollapsed$}
                toggle={setIsSideNavCollapsed}
              />
            )}
          </>
        </Router>

        {/* render separate collapse button for v2 sidenav in grid layout */}
        {!includeSideNav && (
          <SideNavV2CollapseButton
            isCollapsed={this.isSideNavCollapsed$}
            toggle={setIsSideNavCollapsed}
          />
        )}
      </ProjectHeader>
    );

    const getLegacyHeaderComponentForFixedLayout = (
      {
        projectSideNavVersion,
      }: {
        projectSideNavVersion: 'v1' | 'v2';
      } = { projectSideNavVersion: 'v1' }
    ) => {
      const defaultChromeStyle = chromeStyleSubject$.getValue();

      const HeaderComponent = () => {
        // TODO: remove useObservable usage https://github.com/elastic/kibana/issues/225265
        const isVisible = useObservable(this.isVisible$);
        const chromeStyle = useObservable(chromeStyle$, defaultChromeStyle);

        if (!isVisible) {
          return (
            <div data-test-subj="kibanaHeaderChromeless">
              <LoadingIndicator loadingCount$={http.getLoadingCount$()} showAsBar />
              <HeaderTopBanner headerBanner$={headerBanner$.pipe(takeUntil(this.stop$))} />
            </div>
          );
        }

        if (chromeStyle === undefined) return null;

        // render header
        if (chromeStyle === 'project') {
          return getProjectHeader({
            isFixed: true,
            includeBanner: true,
            includeSideNav: projectSideNavVersion,
            includeAppMenu: true,
          });
        }

        return getClassicHeader({ isFixed: true, includeBanner: true });
      };

      return <HeaderComponent />;
    };

    const getClassicHeaderComponentForGridLayout = () => {
      return getClassicHeader({ isFixed: false, includeBanner: false });
    };

    const getProjectHeaderComponentForGridLayout = ({
      includeSideNav,
    }: {
      includeSideNav: false | 'v1' | 'v2';
    }) => {
      return getProjectHeader({
        includeSideNav,
        // in grid layout the header is not fixed, but is inside grid's layout header cell
        isFixed: false,
        // in grid layout the layout is responsible for rendering the banner
        includeBanner: false,
        // in grid layout the application subheader is rendered by the layout service as part of the application slot
        includeAppMenu: false,
      });
    };

    const getProjectSideNavV2ComponentForGridLayout = () => {
      return <GridLayoutProjectSideNavV2 isCollapsed$={this.isSideNavCollapsed$} />;
    };

    return {
      // TODO: this service does too much and doesn't have to compose these headers components.
      // let's get rid of this in the future https://github.com/elastic/kibana/issues/225264
      getLegacyHeaderComponentForFixedLayout,
      getClassicHeaderComponentForGridLayout,
      getProjectHeaderComponentForGridLayout,
      getProjectSideNavV2ComponentForGridLayout,
      getHeaderBanner: () => {
        return (
          <HeaderTopBanner
            headerBanner$={headerBanner$.pipe(takeUntil(this.stop$))}
            position={'static'}
          />
        );
      },
      getChromelessHeader: () => {
        return (
          <div data-test-subj="kibanaHeaderChromeless">
            <LoadingIndicator loadingCount$={http.getLoadingCount$()} showAsBar />
          </div>
        );
      },
      getProjectAppMenuComponent: () => {
        return <AppMenuBar appMenuActions$={application.currentActionMenu$} isFixed={false} />;
      },

      // chrome APIs
      navControls,
      navLinks,
      recentlyAccessed,
      docTitle,

      getIsVisible$: () => this.isVisible$,

      setIsVisible: this.setIsVisible.bind(this),

      getBadge$: () => badge$.pipe(takeUntil(this.stop$)),

      setBadge: (badge: ChromeBadge) => {
        badge$.next(badge);
      },

      getBreadcrumbs$: () => breadcrumbs$.pipe(takeUntil(this.stop$)),

      setBreadcrumbs: setClassicBreadcrumbs,

      getBreadcrumbsAppendExtensions$: () =>
        breadcrumbsAppendExtensions$.pipe(takeUntil(this.stop$)),

      setBreadcrumbsAppendExtension: (
        breadcrumbsAppendExtension: ChromeBreadcrumbsAppendExtension
      ) => {
        breadcrumbsAppendExtensions$.next(
          [...breadcrumbsAppendExtensions$.getValue(), breadcrumbsAppendExtension].sort(
            ({ order: orderA = 50 }, { order: orderB = 50 }) => orderA - orderB
          )
        );
        return () => {
          breadcrumbsAppendExtensions$.next(
            breadcrumbsAppendExtensions$
              .getValue()
              .filter((ext) => ext !== breadcrumbsAppendExtension)
          );
        };
      },

      getGlobalHelpExtensionMenuLinks$: () => globalHelpExtensionMenuLinks$.asObservable(),

      registerGlobalHelpExtensionMenuLink: (
        globalHelpExtensionMenuLink: ChromeGlobalHelpExtensionMenuLink
      ) => {
        globalHelpExtensionMenuLinks$.next([
          ...globalHelpExtensionMenuLinks$.value,
          globalHelpExtensionMenuLink,
        ]);
      },

      getHelpExtension$: () => helpExtension$.pipe(takeUntil(this.stop$)),

      setHelpExtension: (helpExtension?: ChromeHelpExtension) => {
        helpExtension$.next(helpExtension);
      },

      setHelpSupportUrl: (url: string) => helpSupportUrl$.next(url),

      getHelpSupportUrl$: () => helpSupportUrl$.pipe(takeUntil(this.stop$)),

      getCustomNavLink$: () => customNavLink$.pipe(takeUntil(this.stop$)),

      setCustomNavLink: (customNavLink?: ChromeNavLink) => {
        customNavLink$.next(customNavLink);
      },

      setHelpMenuLinks: (helpMenuLinks: ChromeHelpMenuLink[]) => {
        navControls.setHelpMenuLinks(helpMenuLinks);
      },

      setHeaderBanner: (headerBanner?: ChromeUserBanner) => {
        headerBanner$.next(headerBanner);
      },

      hasHeaderBanner$: () => {
        return headerBanner$.pipe(
          takeUntil(this.stop$),
          map((banner) => Boolean(banner))
        );
      },

      getBodyClasses$: () => bodyClasses$.pipe(takeUntil(this.stop$)),
      setChromeStyle,
      getChromeStyle$: () => chromeStyle$,
      sideNav: {
        getIsCollapsed$: () => this.isSideNavCollapsed$.asObservable(),
        setIsCollapsed: setIsSideNavCollapsed,
        getPanelSelectedNode$: projectNavigation.getPanelSelectedNode$.bind(projectNavigation),
        setPanelSelectedNode: projectNavigation.setPanelSelectedNode.bind(projectNavigation),
        getIsFeedbackBtnVisible$: () =>
          combineLatest([this.isFeedbackBtnVisible$, this.isSideNavCollapsed$]).pipe(
            map(([isVisible, isCollapsed]) => isVisible && !isCollapsed)
          ),
        setIsFeedbackBtnVisible: (isVisible: boolean) => this.isFeedbackBtnVisible$.next(isVisible),
      },
      getActiveSolutionNavId$: () => projectNavigation.getActiveSolutionNavId$(),
      project: {
        setHome: setProjectHome,
        setCloudUrls: projectNavigation.setCloudUrls.bind(projectNavigation),
        setProjectName,
        initNavigation: initProjectNavigation,
        getNavigationTreeUi$: () => projectNavigation.getNavigationTreeUi$(),
        setBreadcrumbs: setProjectBreadcrumbs,
        getBreadcrumbs$: projectNavigation.getProjectBreadcrumbs$.bind(projectNavigation),
        getActiveNavigationNodes$: () => projectNavigation.getActiveNodes$(),
        updateSolutionNavigations: projectNavigation.updateSolutionNavigations,
        changeActiveSolutionNavigation: projectNavigation.changeActiveSolutionNavigation,
      },
    };
  }

  public stop() {
    this.navLinks.stop();
    this.projectNavigation.stop();
    this.stop$.next();
    this.mutationObserver?.disconnect();
  }
}
