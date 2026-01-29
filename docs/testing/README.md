# Testing Documentation - Conversation Insights

## Quick Start

This directory contains comprehensive testing documentation for the Conversation Insights feature.

## Documents

### 1. conversation-insights-e2e-test.md
**Purpose:** Test plan template for manual end-to-end testing

**When to use:**
- First-time feature validation
- Release candidate testing
- User acceptance testing
- Quick smoke tests

**What it contains:**
- Pre-requisites checklist
- Step-by-step test instructions
- Expected results for each step
- Error case scenarios
- Security checks
- Performance benchmarks
- Sign-off section

### 2. test-execution-report.md
**Purpose:** Detailed test execution report with results

**When to use:**
- During actual test execution
- For documenting test results
- For sharing findings with team
- For release documentation

**What it contains:**
- Environment setup verification
- Detailed test scenarios (happy path, error cases, edge cases, security)
- Performance benchmarks table
- Test results summary
- Issues tracking
- Recommendations for production
- Sign-off checklist

### 3. test-automation-guide.md
**Purpose:** Guide for implementing automated E2E tests

**When to use:**
- Setting up CI/CD pipeline
- Creating Playwright tests
- Automating regression testing
- Performance testing

**What it contains:**
- Playwright setup instructions
- Sample test code
- Database testing examples
- Performance testing examples
- CI/CD integration (GitHub Actions)
- Best practices and troubleshooting

## How to Test

### Option 1: Manual Testing (Recommended for first run)

1. **Start the development server:**
   ```bash
   npm run dev
   ```

2. **Follow the test plan:**
   - Open `conversation-insights-e2e-test.md`
   - Check off each pre-requisite
   - Execute each test step
   - Mark pass/fail for each test

3. **Document results:**
   - Use `test-execution-report.md` to record findings
   - Fill in performance metrics
   - Document any issues found
   - Complete the sign-off section

### Option 2: Automated Testing (Future implementation)

1. **Install Playwright:**
   ```bash
   npm install -D @playwright/test
   npx playwright install
   ```

2. **Run tests:**
   ```bash
   npx playwright test
   ```

3. **View report:**
   ```bash
   npx playwright show-report
   ```

## Test Data

### Sample Files

Located in `/test-data/`:

- `sample-conversation.txt` - Realistic Chinese conversation with all 6 dimensions
  - Contains: 关注点, 目标, 困扰, 需要拍板的事情, 风险, 行动项
  - Size: ~1KB
  - Expected extraction: 18 items (3 per dimension)

### Creating Additional Test Data

You can create additional test files by following this structure:

```
[会议记录标题] - [负责人]

关注点：
- [关注点1]
- [关注点2]

目标：
- [目标1]
- [目标2]

困扰：
- [困扰1]
- [困扰2]

需要拍板的事情：
- [决策1]
- [决策2]

风险：
- [风险1]
- [风险2]

行动项：
- [负责人] [时间] 前 [行动1]
- [负责人] [时间] 前 [行动2]
```

## Key Test Scenarios

### 1. Happy Path (Must Pass)
- Upload file → Extract → Review → Edit → Delete → Confirm → Verify DB
- Expected time: < 60 seconds
- Expected result: All items confirmed, database state correct

### 2. Error Handling (Must Pass)
- Invalid file type: Should show clear error
- Empty file: Should handle gracefully
- Network errors: Should allow retry
- Invalid IDs: Should show 404

### 3. Edge Cases (Should Pass)
- Delete all items: Confirm button disabled
- Concurrent uploads: No race conditions
- Browser navigation: No data loss

### 4. Security (Must Pass)
- Authentication required
- CUID validation works
- No path traversal vulnerabilities

## Success Criteria

Before marking Task 12 as complete, ensure:

- [ ] All test documentation created
- [ ] Sample test data created
- [ ] Manual testing completed successfully
- [ ] All critical test cases pass
- [ ] Database integrity verified
- [ ] Performance is acceptable (< 60s for full flow)
- [ ] No critical security issues
- [ ] Test results documented
- [ ] Issues logged (if any)

## Common Issues and Solutions

### Issue: LLM extraction takes too long
**Solution:**
- Check OpenAI API status
- Verify network connection
- Consider using streaming responses in future

### Issue: File upload fails
**Solution:**
- Check file size limits
- Verify file format
- Check server logs for errors

### Issue: Database state inconsistent
**Solution:**
- Check transaction logic
- Verify Prisma schema matches database
- Run migrations if needed

### Issue: Tests are flaky
**Solution:**
- Increase timeouts for LLM operations
- Add proper wait conditions
- Use transactions for test isolation

## Metrics to Track

### Performance Metrics
- Upload time (should be < 5s for 100KB)
- Extraction time (should be < 30s)
- Confirmation time (should be < 5s)
- Full flow time (should be < 60s)

### Quality Metrics
- Extraction accuracy (items match conversation)
- Evidence relevance (evidence supports content)
- Dimension classification (correct dimension assigned)
- No data loss (all items saved correctly)

## Next Steps After Testing

1. **If tests pass:**
   - Mark Task 12 as complete
   - Create pull request
   - Request code review
   - Prepare for deployment

2. **If tests fail:**
   - Document all failures in detail
   - Create issue tickets
   - Fix critical issues
   - Re-run tests
   - Update documentation

3. **Future improvements:**
   - Implement automated tests
   - Add more test cases
   - Set up CI/CD pipeline
   - Add monitoring and alerting

## Resources

### Internal Documentation
- `conversation-insights-e2e-test.md` - Test plan
- `test-execution-report.md` - Execution report
- `test-automation-guide.md` - Automation guide

### External Resources
- [Playwright Documentation](https://playwright.dev/)
- [Prisma Testing Best Practices](https://www.prisma.io/docs/guides/testing)
- [Next.js Testing Documentation](https://nextjs.org/docs/testing)

## Support

If you encounter any issues during testing:

1. Check the troubleshooting section in `test-automation-guide.md`
2. Review the implementation files for recent changes
3. Check server logs and browser console
4. Document the issue in `test-execution-report.md`
5. Create a detailed bug report

## Contribution

To improve the testing documentation:

1. Add new test scenarios as you discover them
2. Update expected results if requirements change
3. Document workarounds for known issues
4. Share performance benchmarks from your environment
5. Contribute automated test examples

---

**Last Updated:** 2026-01-29
**Maintained by:** Development Team
**Version:** 1.0
