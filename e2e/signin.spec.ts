import { expect, test } from '@playwright/test'

const providers = {
  nodemailer: {
    id: 'nodemailer',
    name: 'Email',
    type: 'email',
    signinUrl: '/api/auth/signin/nodemailer',
    callbackUrl: '/api/auth/callback/nodemailer',
  },
}

for (const viewport of [
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'compact-600', width: 600, height: 900 },
]) {
  test(`sign-in is keyboard-accessible in light and dark at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.addInitScript(() => localStorage.setItem('theme', 'light'))
    await page.route('**/api/auth/providers', (route) => route.fulfill({ json: providers }))
    await page.goto('/en/signin')

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.locator('main')).toHaveClass(/doc-grid/)
    await expect(page.locator('.ui-card')).toBeVisible()
    await expect(page.locator('main').getByRole('alert')).toHaveCount(0)
    await expect(page.getByLabel('Email')).toBeVisible()
    await expectNoHorizontalClipping(page)
    await expect(page).toHaveScreenshot(`signin-${viewport.name}-light.png`, {
      fullPage: true,
      maxDiffPixelRatio: 0.03,
    })

    const themeButton = page.getByRole('button', { name: /theme/i })
    await themeButton.focus()
    await page.keyboard.press('Enter')
    await page.getByRole('menuitem', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('html')).toHaveClass(/dark/)

    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).not.toHaveCount(0)
    await expect(page).toHaveScreenshot(`signin-${viewport.name}-dark.png`, {
      fullPage: true,
      maxDiffPixelRatio: 0.03,
    })
  })
}

async function expectNoHorizontalClipping(page: import('@playwright/test').Page) {
  expect(
    await page.evaluate(
      () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= window.innerWidth
    )
  ).toBe(true)
}
