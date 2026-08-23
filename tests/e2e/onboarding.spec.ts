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

  test("menyelesaikan setup dari PDF sampai preview lalu Hari Ini", async ({ page }) => {
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
    await expect(page.getByRole("heading", { name: "Rencana Belajarmu Sudah Siap" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Kalender Planify")).toBeVisible();
    await page.getByRole("button", { name: "Mulai Gunakan Rencana" }).click();

    await expect(page).toHaveURL(/\/hari-ini$/);
    await expect(page.getByRole("heading", { name: "Hari Ini" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("link", { name: "Progres" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Profil" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Hari Ini" })).toBeVisible();

    await page.goto("/");
    await expect(page).toHaveURL(/\/hari-ini$/);
    await expect(page.getByRole("heading", { name: "Hari Ini" })).toBeVisible();

    await page.goto("/profil");
    await expect(page.getByText("Akun", { exact: true })).toBeVisible();
    await expect(page.getByText("Semester Aktif", { exact: true })).toBeVisible();
    await expect(page.getByText("Preferensi Belajar", { exact: true })).toBeVisible();
    await expect(page.getByText("Integrasi", { exact: true })).toBeVisible();
    await expect(page.getByText("Pengaturan Akun", { exact: true })).toBeVisible();
    const previousSetup = await page.evaluate(() => JSON.parse(window.localStorage.getItem("planify:onboarding:v1") ?? "null"));
    expect(previousSetup.courses.length).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Mulai Semester Baru" }).click();
    await expect(page.getByRole("dialog", { name: "Mulai Semester Baru" })).toBeVisible();
    await page.getByRole("button", { name: "Lanjutkan" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "KRS" })).toBeVisible();
    const semesterState = await page.evaluate(() => ({
      history: JSON.parse(window.localStorage.getItem("planify:semester-history:v1") ?? "[]"),
      current: JSON.parse(window.localStorage.getItem("planify:onboarding:v1") ?? "null"),
    }));
    expect(semesterState.history).toHaveLength(1);
    expect(semesterState.history[0].setup_payload).toEqual(previousSetup);
    expect(semesterState.current.courses).toEqual([]);
    expect(semesterState.current.classSchedules).toEqual({});
    expect(semesterState.current.academicEvents).toEqual([]);
    expect(semesterState.current.studyPlan).toBeUndefined();
    expect(semesterState.current.planActive).toBe(false);
  });
});
