# Conversation Insights System - End-to-End Test

## Test Environment
- Date: 2026-01-29
- Branch: feature/conversation-insights
- Tester: Claude Sonnet 4.5

## Test Scenario: Complete Upload → Extract → Review → Confirm Flow

### Pre-requisites
- [ ] System is running (npm run dev)
- [ ] Database is up and running
- [ ] OpenAI API key is configured
- [ ] Test user is logged in
- [ ] At least one assignee exists in the system

### Test Steps

#### 1. Navigate to Assignee Detail Page
- [ ] Go to `/assignees`
- [ ] Click on an assignee name
- [ ] Verify assignee detail page loads
- [ ] Verify "Upload Dialog" button is visible

**Expected Result:** Assignee detail page displays with upload button

#### 2. Upload Test File
- [ ] Click "Upload Dialog" button
- [ ] Verify dialog opens
- [ ] Select `test-data/sample-conversation.txt` file
- [ ] Click "Upload and Extract" button
- [ ] Verify progress indicator shows

**Expected Result:**
- Progress bar shows 0% → 40% (uploading)
- Progress bar shows 40% → 80% (extracting)
- Progress bar shows 80% → 100% (complete)
- No error messages appear

#### 3. Review Extracted Items
- [ ] Verify redirect to `/insights/review/[artifactId]`
- [ ] Verify all 6 dimensions are displayed
- [ ] Verify items are grouped correctly:
  - 关注点 (focus): 3 items
  - 目标 (goal): 3 items
  - 困扰 (obstacle): 3 items
  - 需要拍板的事情 (decision): 3 items
  - 风险 (risk): 3 items
  - 行动项 (action): 3 items
- [ ] Verify evidence is shown for each item
- [ ] Verify decision items show type (must_decide/need_intervene)
- [ ] Verify action items show action and ETA

**Expected Result:**
- All items extracted correctly
- Content matches source conversation
- Evidence sentences are accurate
- Metadata (decision type, action, ETA) is correct

#### 4. Edit Items
- [ ] Edit the content of one item
- [ ] Verify content updates in real-time
- [ ] Delete one item
- [ ] Verify confirmation dialog appears
- [ ] Confirm deletion
- [ ] Verify item is removed from list
- [ ] Verify item count updates

**Expected Result:**
- Content editing works smoothly
- Deletion requires confirmation
- UI updates reflect changes immediately

#### 5. Confirm Items
- [ ] Click "Confirm" button
- [ ] Verify loading state shows
- [ ] Wait for confirmation to complete
- [ ] Verify success message appears
- [ ] Verify redirect to assignee detail page

**Expected Result:**
- Success message: "成功确认 X 个条目"
- Redirect happens automatically
- No errors in console

#### 6. Verify Database State
- [ ] Open database tool (Prisma Studio or psql)
- [ ] Verify Artifact record exists with status 'confirmed'
- [ ] Verify DraftItems are deleted
- [ ] Verify ConfirmedItems are created
- [ ] Verify ConfirmedItems count matches expected
- [ ] Verify no evidence field in ConfirmedItems

**Expected Result:**
- Database state is consistent
- All operations are atomic (transaction succeeded)
- No orphaned records

### Error Cases to Test

#### Invalid File Type
- [ ] Try to upload a .exe or .jpg file
- [ ] Verify error message appears
- [ ] Verify upload is blocked

**Expected Result:** Clear error message about invalid file type

#### Empty File
- [ ] Try to upload an empty .txt file
- [ ] Verify error handling

**Expected Result:** Appropriate error message

#### Concurrent Uploads
- [ ] Upload two files for same assignee simultaneously
- [ ] Verify both are processed correctly
- [ ] Verify no race conditions

**Expected Result:** Both uploads succeed independently

### Performance Benchmarks
- [ ] Upload time for 1KB file: ______ seconds
- [ ] Upload time for 100KB file: ______ seconds
- [ ] Extraction time for short text (<5000 chars): ______ seconds
- [ ] Extraction time for long text (>5000 chars): ______ seconds
- [ ] Full flow completion time: ______ seconds

### Security Checks
- [ ] Verify session authentication is required
- [ ] Verify file path traversal protection works
- [ ] Verify CUID validation rejects invalid IDs
- [ ] Verify race condition protection works
- [ ] Verify input validation rejects malformed data

## Test Results

### Summary
- Total Test Cases: ____
- Passed: ____
- Failed: ____
- Blocked: ____

### Issues Found
1. [Issue description]
   - Severity: [Critical/Important/Minor]
   - Steps to reproduce:
   - Expected vs Actual:

### Sign-off
- [ ] All critical test cases passed
- [ ] All known issues are documented
- [ ] System is ready for deployment

**Tester:** ________________
**Date:** ________________
**Approved by:** ________________
