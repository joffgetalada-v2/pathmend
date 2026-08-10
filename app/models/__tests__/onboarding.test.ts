import { describe, expect, test } from "vitest";

import { onboardingSteps, type OnboardingState } from "../onboarding";

const state = (over: Partial<OnboardingState> = {}): OnboardingState => ({
  hasCaptured404: false,
  hasRedirect: false,
  ...over,
});

describe("onboardingSteps", () => {
  test("all incomplete for a brand-new shop", () => {
    const steps = onboardingSteps(state());
    expect(steps.map((s) => s.done)).toEqual([false, false, false]);
    expect(steps).toHaveLength(3);
  });

  test("capturing a 404 completes the embed step (proof the embed is live)", () => {
    const steps = onboardingSteps(state({ hasCaptured404: true }));
    expect(steps[0]!.done).toBe(true);
  });

  test("a captured 404 also completes the detect/import step", () => {
    const steps = onboardingSteps(state({ hasCaptured404: true }));
    expect(steps[1]!.done).toBe(true);
  });

  test("creating a redirect completes the final step", () => {
    const steps = onboardingSteps(state({ hasRedirect: true }));
    expect(steps[2]!.done).toBe(true);
  });

  test("every step has a title, description, and a next action", () => {
    for (const step of onboardingSteps(state())) {
      expect(step.title).toBeTruthy();
      expect(step.description).toBeTruthy();
      expect(step.action.label).toBeTruthy();
      expect(step.action.href).toBeTruthy();
    }
  });

  test("the embed step deep-links to the theme editor", () => {
    const steps = onboardingSteps(state(), {
      shop: "demo.myshopify.com",
    });
    expect(steps[0]!.action.href).toContain(
      "demo.myshopify.com/admin/themes/current/editor",
    );
    expect(steps[0]!.action.href).toContain("context=apps");
  });

  test("includes activateAppId when the extension id is known", () => {
    const steps = onboardingSteps(state(), {
      shop: "demo.myshopify.com",
      themeExtensionId: "abc-123",
    });
    expect(steps[0]!.action.href).toContain(
      "activateAppId=abc-123/notfound-capture",
    );
  });

  test("falls back to the plain theme editor without a shop", () => {
    const steps = onboardingSteps(state());
    expect(steps[0]!.action.href).toBe("/app");
  });
});

describe("isOnboardingComplete", () => {
  test("complete only when all steps are done", async () => {
    const { isOnboardingComplete } = await import("../onboarding");
    expect(
      isOnboardingComplete(state({ hasCaptured404: true, hasRedirect: true })),
    ).toBe(true);
    expect(isOnboardingComplete(state({ hasRedirect: true }))).toBe(false);
  });
});
