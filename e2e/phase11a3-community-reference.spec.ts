import { expect, test } from '@playwright/test';

for (const route of [
  { id: 'shuffling-horror', expected: { guardianDefinitionId: 'community-dd-guardian-family-shuffling-horror', shufflingActorIds: ['u_community-dd-shuffling-horror', 'u_community-dd-cultist-priest', 'u_community-dd-malignant-growth'] } },
  { id: 'templars', expected: { guardianDefinitionId: 'community-dd-guardian-family-templars', templarActorDefinitionIds: ['community-dd-templars-impaler', 'community-dd-templars-warlord'] } },
  { id: 'mammoth-cyst', expected: { guardianDefinitionId: 'community-dd-guardian-family-mammoth-cyst', mammothActorDefinitionIds: ['community-dd-mammoth-cyst'] } },
] as const) {
  test(`COMMUNITY-E2E-${route.id} checkpoint → public store action → Community Guardian`, async ({ page }) => {
    await page.goto('/');
    await page.getByTestId(`e2e-community-${route.id}`).click();
    await expect(page.getByTestId('e2e-error')).toBeEmpty();
    const result = JSON.parse(await page.getByTestId('e2e-state').innerText());
    expect(result).toMatchObject({ runtimeProfileId: 'community-reference', ...route.expected });
  });
}
