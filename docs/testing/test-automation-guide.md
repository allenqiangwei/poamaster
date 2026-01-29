# Test Automation Guide - Conversation Insights

## Overview

This guide provides instructions for automating the conversation insights end-to-end tests using Playwright.

## Setup

### Install Playwright

```bash
npm install -D @playwright/test
npx playwright install
```

### Create Test Configuration

Create `playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3030',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3030',
    reuseExistingServer: !process.env.CI,
  },
});
```

## Sample Test: Complete Upload Flow

Create `tests/e2e/conversation-insights.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Conversation Insights E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Login if authentication is required
    // await page.goto('/login');
    // await page.fill('[name="email"]', 'test@example.com');
    // await page.fill('[name="password"]', 'password');
    // await page.click('button[type="submit"]');
  });

  test('should complete upload → extract → review → confirm flow', async ({ page }) => {
    // Step 1: Navigate to assignee detail page
    await page.goto('/assignees');
    await page.waitForLoadState('networkidle');

    // Click on first assignee
    const firstAssignee = page.locator('table tbody tr').first();
    await firstAssignee.click();

    // Verify upload button is visible
    const uploadButton = page.getByRole('button', { name: /上传对话/ });
    await expect(uploadButton).toBeVisible();

    // Step 2: Upload test file
    await uploadButton.click();

    // Verify dialog opens
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Upload file
    const fileInput = page.locator('input[type="file"]');
    const filePath = path.join(process.cwd(), 'test-data', 'sample-conversation.txt');
    await fileInput.setInputFiles(filePath);

    // Click upload button
    const submitButton = page.getByRole('button', { name: /上传并提取/ });
    await submitButton.click();

    // Wait for progress (should show "处理中...")
    await expect(page.getByText(/处理中/)).toBeVisible();

    // Wait for redirect to review page (timeout: 30 seconds for LLM processing)
    await page.waitForURL(/\/insights\/review\/.*/, { timeout: 30000 });

    // Step 3: Verify review page
    await expect(page.getByRole('heading', { name: /审核对话洞察/ })).toBeVisible();

    // Verify file information
    await expect(page.getByText(/sample-conversation\.txt/)).toBeVisible();

    // Verify dimensions are displayed
    const dimensions = [
      '关注点',
      '目标',
      '困扰',
      '需要拍板的事情',
      '风险',
      '行动项'
    ];

    for (const dimension of dimensions) {
      await expect(page.getByText(dimension)).toBeVisible();
    }

    // Count total items
    const itemCards = page.locator('[role="textbox"]');
    const itemCount = await itemCards.count();
    expect(itemCount).toBeGreaterThan(0);

    // Step 4: Edit an item
    const firstItem = itemCards.first();
    await firstItem.click();
    await firstItem.fill('测试编辑内容');
    await expect(firstItem).toHaveValue('测试编辑内容');

    // Step 5: Delete an item
    const deleteButtons = page.getByRole('button', { name: /delete/i });
    const initialCount = itemCount;

    await deleteButtons.first().click();

    // Confirm deletion
    const confirmDialog = page.getByRole('dialog');
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog.getByText(/确定要删除/)).toBeVisible();

    const confirmDeleteButton = confirmDialog.getByRole('button', { name: /删除/ });
    await confirmDeleteButton.click();

    // Verify item is deleted
    const updatedItemCards = page.locator('[role="textbox"]');
    const updatedCount = await updatedItemCards.count();
    expect(updatedCount).toBe(initialCount - 1);

    // Step 6: Confirm items
    const confirmButton = page.getByRole('button', { name: /确认入库/ });
    await confirmButton.click();

    // Wait for loading state
    await expect(page.getByText(/确认中/)).toBeVisible();

    // Wait for success message
    await expect(page.getByText(/成功确认.*个条目/)).toBeVisible({ timeout: 10000 });

    // Wait for redirect to assignee detail page
    await page.waitForURL(/\/assignees\/.*/, { timeout: 5000 });

    // Verify we're back on assignee detail page
    await expect(uploadButton).toBeVisible();
  });

  test('should handle invalid file type', async ({ page }) => {
    await page.goto('/assignees');
    await page.waitForLoadState('networkidle');

    const firstAssignee = page.locator('table tbody tr').first();
    await firstAssignee.click();

    const uploadButton = page.getByRole('button', { name: /上传对话/ });
    await uploadButton.click();

    // Try to upload invalid file type
    // Note: Browser file picker will filter by accept attribute
    const fileInput = page.locator('input[type="file"]');
    const acceptAttribute = await fileInput.getAttribute('accept');
    expect(acceptAttribute).toContain('.txt');
    expect(acceptAttribute).toContain('.pdf');
    expect(acceptAttribute).toContain('.docx');
  });

  test('should handle empty file', async ({ page }) => {
    // Create empty file programmatically in test
    await page.goto('/assignees');
    await page.waitForLoadState('networkidle');

    const firstAssignee = page.locator('table tbody tr').first();
    await firstAssignee.click();

    const uploadButton = page.getByRole('button', { name: /上传对话/ });
    await uploadButton.click();

    // Upload empty file
    const fileInput = page.locator('input[type="file"]');

    // Create a temporary empty file
    const emptyBuffer = Buffer.from('');
    await fileInput.setInputFiles({
      name: 'empty.txt',
      mimeType: 'text/plain',
      buffer: emptyBuffer,
    });

    const submitButton = page.getByRole('button', { name: /上传并提取/ });
    await submitButton.click();

    // Should show error or handle gracefully
    // This will depend on your actual implementation
  });

  test('should require authentication', async ({ page }) => {
    // Logout first
    // await page.goto('/logout');

    // Try to access review page directly
    await page.goto('/insights/review/invalid-id-12345');

    // Should redirect to login or show error
    // await expect(page).toHaveURL(/\/login/);
  });

  test('should handle invalid artifact ID', async ({ page }) => {
    // Try to access with invalid ID
    await page.goto('/insights/review/invalid-id-12345');

    // Should show 404 or error page
    // This will depend on your actual implementation
  });

  test('should allow concurrent uploads', async ({ browser }) => {
    // Create two contexts (like two browser tabs)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      // Navigate both to assignee page
      await page1.goto('/assignees');
      await page2.goto('/assignees');

      // Click on same assignee
      await page1.locator('table tbody tr').first().click();
      await page2.locator('table tbody tr').first().click();

      // Upload files simultaneously
      const uploadFile = async (page: any) => {
        const uploadButton = page.getByRole('button', { name: /上传对话/ });
        await uploadButton.click();

        const fileInput = page.locator('input[type="file"]');
        const filePath = path.join(process.cwd(), 'test-data', 'sample-conversation.txt');
        await fileInput.setInputFiles(filePath);

        const submitButton = page.getByRole('button', { name: /上传并提取/ });
        await submitButton.click();

        // Wait for redirect
        await page.waitForURL(/\/insights\/review\/.*/, { timeout: 30000 });
      };

      // Run both uploads in parallel
      await Promise.all([
        uploadFile(page1),
        uploadFile(page2),
      ]);

      // Both should succeed and have different artifact IDs
      const url1 = page1.url();
      const url2 = page2.url();

      expect(url1).toContain('/insights/review/');
      expect(url2).toContain('/insights/review/');
      expect(url1).not.toBe(url2);

    } finally {
      await context1.close();
      await context2.close();
    }
  });
});
```

## Database Testing

Create `tests/e2e/database.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { prisma } from '@/lib/prisma';

test.describe('Database State Verification', () => {
  test('should verify artifact status after confirmation', async ({ page }) => {
    // Upload and confirm an artifact
    // ... (similar to previous test)

    // Extract artifact ID from URL
    const url = page.url();
    const artifactId = url.split('/').pop();

    if (!artifactId) {
      throw new Error('Could not extract artifact ID');
    }

    // Verify database state
    const artifact = await prisma.artifact.findUnique({
      where: { id: artifactId },
      include: {
        draftItems: true,
        confirmedItems: true,
      },
    });

    expect(artifact).toBeTruthy();
    expect(artifact?.status).toBe('confirmed');

    // Draft items should be deleted or marked as deleted
    const activeDrafts = artifact?.draftItems.filter(item => !item.isDeleted);
    expect(activeDrafts?.length).toBe(0);

    // Confirmed items should exist
    expect(artifact?.confirmedItems.length).toBeGreaterThan(0);

    // Confirmed items should not have evidence
    artifact?.confirmedItems.forEach(item => {
      expect(item.evidence).toBeNull();
    });
  });
});
```

## Performance Testing

Create `tests/e2e/performance.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Performance Benchmarks', () => {
  test('should measure upload and extraction time', async ({ page }) => {
    await page.goto('/assignees');
    await page.locator('table tbody tr').first().click();

    const uploadButton = page.getByRole('button', { name: /上传对话/ });
    await uploadButton.click();

    const fileInput = page.locator('input[type="file"]');
    const filePath = path.join(process.cwd(), 'test-data', 'sample-conversation.txt');
    await fileInput.setInputFiles(filePath);

    const submitButton = page.getByRole('button', { name: /上传并提取/ });

    // Measure total time
    const startTime = Date.now();
    await submitButton.click();
    await page.waitForURL(/\/insights\/review\/.*/, { timeout: 60000 });
    const endTime = Date.now();

    const totalTime = endTime - startTime;

    console.log(`Total upload and extraction time: ${totalTime}ms`);

    // Assert reasonable performance
    expect(totalTime).toBeLessThan(60000); // Less than 60 seconds
    expect(totalTime).toBeGreaterThan(1000); // At least 1 second (sanity check)
  });
});
```

## Running Tests

### Run all tests
```bash
npx playwright test
```

### Run specific test file
```bash
npx playwright test tests/e2e/conversation-insights.spec.ts
```

### Run with UI mode (helpful for debugging)
```bash
npx playwright test --ui
```

### Run in headed mode (see browser)
```bash
npx playwright test --headed
```

### Generate test report
```bash
npx playwright show-report
```

## CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/e2e-tests.yml`:

```yaml
name: E2E Tests

on:
  push:
    branches: [main, feature/*]
  pull_request:
    branches: [main]

jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: poamaster_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Setup database
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/poamaster_test

      - name: Install Playwright Browsers
        run: npx playwright install --with-deps

      - name: Run E2E tests
        run: npx playwright test
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/poamaster_test
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

      - name: Upload test results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

## Best Practices

1. **Test Isolation:**
   - Each test should be independent
   - Clean up test data after tests
   - Use transactions where possible

2. **Fixtures:**
   - Create reusable fixtures for common setup
   - Use beforeEach/afterEach for cleanup

3. **Assertions:**
   - Use meaningful assertion messages
   - Test both success and failure cases
   - Verify database state changes

4. **Performance:**
   - Set appropriate timeouts for LLM operations
   - Use parallel execution when possible
   - Monitor and optimize slow tests

5. **Debugging:**
   - Use screenshots and videos for failures
   - Enable trace on first retry
   - Use --debug flag for step-by-step execution

## Troubleshooting

### Tests are flaky
- Increase timeout values for LLM operations
- Add explicit waits for network requests
- Use `waitForLoadState('networkidle')`

### Database connection issues
- Ensure DATABASE_URL is set correctly
- Check that migrations are applied
- Verify database service is running

### LLM extraction failures
- Check OpenAI API key is valid
- Monitor rate limits
- Add retry logic for transient failures

### Authentication issues
- Ensure test user exists
- Check session handling
- Verify cookies are persisted

## Next Steps

1. **Expand Test Coverage:**
   - Add tests for all dimensions
   - Test edge cases more thoroughly
   - Add visual regression testing

2. **Optimize Performance:**
   - Mock LLM calls in some tests
   - Use test database snapshots
   - Parallelize independent tests

3. **Improve Reporting:**
   - Add custom reporters
   - Track test metrics over time
   - Set up dashboards for CI results

4. **Continuous Improvement:**
   - Review and update tests regularly
   - Remove flaky tests or fix them
   - Keep tests maintainable and readable
