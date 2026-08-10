/**
 * Pure onboarding-checklist logic for the Dashboard's 3-step card. A step is
 * "done" when there's evidence it happened — a captured 404 proves the embed
 * is live, a redirect proves the merchant reached first value.
 */

export const THEME_EXTENSION_HANDLE = "notfound-capture";

export interface OnboardingState {
  /** Any 404 event captured → the storefront embed is installed and firing. */
  hasCaptured404: boolean;
  /** Any redirect created (manual, import, fix, auto-heal). */
  hasRedirect: boolean;
}

export interface OnboardingStep {
  key: string;
  title: string;
  description: string;
  done: boolean;
  action: { label: string; href: string };
}

interface OnboardingContext {
  shop?: string;
  themeExtensionId?: string;
}

/**
 * Deep-links to the theme editor with the app embed pre-selected. The
 * extension UUID is only known after deploy (env), so fall back gracefully:
 * to the editor without activateAppId if we have the shop, else to the app.
 */
function themeEditorHref(context: OnboardingContext): string {
  if (!context.shop) return "/app";
  const base = `https://${context.shop}/admin/themes/current/editor?context=apps`;
  return context.themeExtensionId
    ? `${base}&activateAppId=${context.themeExtensionId}/${THEME_EXTENSION_HANDLE}`
    : base;
}

export function onboardingSteps(
  state: OnboardingState,
  context: OnboardingContext = {},
): OnboardingStep[] {
  return [
    {
      key: "embed",
      title: "Turn on 404 tracking",
      description:
        "Enable the Pathmend app embed in your theme so broken links get captured automatically.",
      done: state.hasCaptured404,
      action: { label: "Open theme editor", href: themeEditorHref(context) },
    },
    {
      key: "detect",
      title: "Find your broken URLs",
      description:
        "Let 404s roll in automatically, or import a list of old URLs to get a head start.",
      done: state.hasCaptured404,
      action: { label: "Import URLs", href: "/app/import" },
    },
    {
      key: "redirect",
      title: "Create your first redirect",
      description:
        "Point a broken URL at the right page — one click from the 404 log, or add it by hand.",
      done: state.hasRedirect,
      action: { label: "Add a redirect", href: "/app/redirects" },
    },
  ];
}

export function isOnboardingComplete(state: OnboardingState): boolean {
  return state.hasCaptured404 && state.hasRedirect;
}
