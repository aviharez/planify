import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const fixture = path.join(process.cwd(), "download.pdf");

async function startDemo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Coba mode demo" }).click();
  await expect(page.locator("#krs-file")).toBeAttached();
  await page.locator("#krs-file").setInputFiles(fixture);
  await expect(page.getByText("hasil baca siap diperiksa")).toBeVisible({
    timeout: 30_000,
  });
}

test.describe("setup lokal Planify", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
  });

  test("mempertahankan setup yang belum selesai setelah dimuat ulang", async ({
    page,
  }) => {
    await startDemo(page);
    await expect(page.getByText("download.pdf")).toBeVisible();
    await page.getByRole("button", { name: "Lanjutkan" }).click();
    await expect(page.getByRole("heading", { name: "Mata Kuliah" })).toBeVisible();
    await page.waitForFunction(() => {
      const value = window.localStorage.getItem("planify:onboarding:v1");
      return value ? JSON.parse(value).step === 1 : false;
    });

    await page.reload();

    await expect(page.getByRole("heading", { name: "Mata Kuliah" })).toBeVisible();
    await expect(page.getByText("Langkah 2 dari 6")).toBeVisible();
    await expect(page.getByText("Pemrograman Berorientasi Objek I")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => JSON.parse(window.localStorage.getItem("planify:onboarding:v1") ?? "{}").krsFileName))
      .toBe("download.pdf");
  });

  test("menyelesaikan setup dari PDF sampai landing Hari Ini", async ({ page }) => {
    await startDemo(page);
    await page.getByRole("button", { name: "Lanjutkan" }).click();
    await expect(page.getByRole("heading", { name: "Mata Kuliah" })).toBeVisible();
    await page.getByRole("button", { name: "Lanjutkan" }).click();

    await expect(page.getByRole("heading", { name: "Jadwal Mingguan" })).toBeVisible();
    await page.getByRole("button", { name: "Malam Hari Kerja" }).click();
    await page.getByRole("button", { name: "Lanjutkan" }).click();

    await expect(page.getByRole("heading", { name: "Kebiasaan Belajar" })).toBeVisible();
    await page.getByRole("button", { name: "Lanjutkan" }).click();

    await expect(
      page.getByRole("heading", { name: "Evaluasi Mata Kuliah" }),
    ).toBeVisible();
    const courseTabs = page.getByRole("button", { name: /Buka evaluasi/ });
    const courseCount = await courseTabs.count();
    for (let index = 0; index < courseCount; index += 1) {
      await courseTabs.nth(index).click();
      await page
        .getByRole("heading", { name: "Seberapa paham kamu?" })
        .locator("..")
        .getByRole("button", { name: "3", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Menurutmu, seberapa sulit?" })
        .locator("..")
        .getByRole("button", { name: "3", exact: true })
        .click();
    }
    await page.getByRole("button", { name: "Lanjutkan" }).click();

    await expect(page.getByRole("heading", { name: "Ringkasan" })).toBeVisible();
    await page.getByRole("button", { name: "Buat Rencana Belajar" }).click();
    await expect(page.getByText("Prioritas Belajar Siap")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("link", { name: "Mulai dari Hari Ini" }).click();

    await expect(page).toHaveURL(/\/hari-ini$/);
    await expect(page.getByRole("heading", { name: "Hari Ini" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("link", { name: "Progres" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Profil" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Hari Ini" })).toBeVisible();
  });
});
