import { expect, test } from "@playwright/test";

test.describe("akses onboarding Planify", () => {
  test("meminta autentikasi tanpa jalur lokal anonim", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /Coba mode/i })).toHaveCount(0);
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
      await expect(page.locator('p[role="alert"]')).toContainText("Supabase");
    } else {
      await expect(page.getByRole("button", { name: "Buat akun" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Masuk" })).toHaveCount(0);
    }
  });
});
