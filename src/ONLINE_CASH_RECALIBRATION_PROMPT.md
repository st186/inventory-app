# Online Cash in Hand (Paytm) - Monthly Recalibration Prompt Feature

## Overview
Successfully implemented an automatic monthly recalibration prompt system that reminds users to recalibrate their Online Cash in Hand (Paytm) balance at the beginning of each month.

## Implementation Details

### 1. State Management
Added three new state variables to `SalesManagement.tsx`:
- `needsOnlineRecalibration`: Tracks whether recalibration is needed for the current month
- `isCheckingRecalibration`: Loading state while checking recalibration status
- `dismissedRecalibrationPrompt`: Tracks if user dismissed the prompt (session-based)

### 2. Automatic Status Checking
**Function**: `checkOnlineRecalibrationStatus()`
- Automatically runs on component mount via useEffect
- Fetches the last Online Cash recalibration record for the store
- Compares the last recalibration's month with the current month (YYYY-MM format)
- Sets `needsOnlineRecalibration` to true if:
  - No recalibration exists, OR
  - Last recalibration was for a previous month

**Dependencies**: Runs when `context.user` or `effectiveStoreId` changes

### 3. Prominent Reminder Banner
**Location**: Sales Management > Offline Sales Tab (above other content)

**Display Logic**:
- Shows when `needsOnlineRecalibration === true`
- Shows when prompt is not dismissed (`!dismissedRecalibrationPrompt`)
- Shows during the first week of the month (days 1-7)
- More prominent on the 1st day of the month

**Features**:
- **Eye-catching design**: Purple-pink gradient with subtle pulse animation
- **Dynamic messaging**: Different text on 1st vs. other days
- **Educational content**: Explains why monthly recalibration is important
- **Two action buttons**:
  - **Recalibrate Now**: Opens the recalibration modal and dismisses prompt
  - **Remind Me Later**: Dismisses prompt temporarily (will reappear on next visit)
- **Dismissable**: X button in top-right corner

### 4. Banner Content
The banner includes:
- 📅 Calendar emoji and smartphone icon for visual recognition
- Clear title: "Monthly Online Cash Recalibration Required"
- Dynamic subtitle based on date
- Benefits list:
  - Verify actual Paytm balance matches system records
  - Catch missing transactions, fees, or discrepancies early
  - Maintain accurate financial tracking
  - Categorize differences as mistakes or loans
- Important warning box

### 5. Integration with Recalibration Modal
**Modal Rendering**: Added `OnlineCashRecalibration` component to render when `showOnlineCashRecalibration === true`

**Props passed**:
- `context`: Full inventory context
- `selectedStoreId`: Current effective store ID
- `systemBalance`: Pre-calculated `calculatePaytmBalance` value
- `onClose`: Closes the modal
- `onSaveSuccess`: Callback that:
  - Re-checks recalibration status
  - Sets `needsOnlineRecalibration` to false
  - Hides the prompt banner

### 6. User Flow
1. **Start of Month**: User opens Sales Management on the 1st (or within first week)
2. **Banner Appears**: If recalibration not done, prominent banner shows
3. **User Actions**:
   - **Option A**: Click "Recalibrate Now" → Opens modal → Complete recalibration → Banner disappears permanently for this month
   - **Option B**: Click "Remind Me Later" → Banner dismisses → Will reappear on next page load/visit if still not completed
   - **Option C**: Click X to dismiss → Same as Option B
4. **After Completion**: Banner won't show again until next month

### 7. Timing and Persistence
- **Check timing**: On component mount
- **Display timing**: First week of each month (days 1-7)
- **Dismissal persistence**: Session-based only (not saved to database)
- **Completion persistence**: Stored in database via recalibration records
- **Monthly reset**: Automatically resets each month based on month comparison

## Technical Benefits

### 1. Proactive Reminder System
- Users don't need to remember to recalibrate
- Automatic detection based on actual data
- Reduces errors from forgotten monthly tasks

### 2. Non-Intrusive Design
- Shows only during relevant time period (first week)
- Can be dismissed temporarily if busy
- Reappears to ensure completion

### 3. Seamless Integration
- Works with existing recalibration modal
- Uses existing API endpoints
- No database schema changes required

### 4. Performance Optimized
- Single API call on component mount
- No polling or continuous checking
- Efficient month comparison logic

## API Endpoints Used

### `getLastOnlineCashRecalibration(accessToken, storeId)`
**Purpose**: Fetch the most recent recalibration record for a store
**Returns**: Recalibration object with `month` field (YYYY-MM format)
**Used by**: `checkOnlineRecalibrationStatus()` function

## Visual Design

### Colors
- **Background**: Purple-pink gradient (from-purple-50 via-pink-50 to-purple-50)
- **Border**: 2px solid purple-400
- **Button**: Gradient from-purple-600 to-pink-600
- **Icons**: Purple-600

### Animation
- Subtle pulse animation (3-second duration)
- Hover effects on buttons
- Shadow elevation on primary button

### Responsive
- Flexbox layout for mobile compatibility
- Stack buttons on smaller screens
- Readable text sizes

## Code Locations

### Main Implementation
- **File**: `/components/SalesManagement.tsx`
- **Lines**: 
  - State: ~55-58
  - Check function: ~117-138
  - useEffect: ~113-115
  - Banner JSX: ~1027-1082
  - Modal rendering: ~2047-2058

### Related Components
- **File**: `/components/OnlineCashRecalibration.tsx`
  - Already implemented with new fields (discrepancyType, loanAmount)
  - Receives `onSaveSuccess` callback

### API Integration
- **File**: `/utils/api.ts`
  - `getLastOnlineCashRecalibration()`: ~2046
  - `submitOnlineCashRecalibration()`: ~2035

## Testing Checklist

### Scenario 1: First Day of Month (No Recalibration)
- [ ] Navigate to Sales Management → Offline Sales tab
- [ ] Verify prominent banner appears with pulse animation
- [ ] Verify text says "It's the 1st of the month!"
- [ ] Click "Recalibrate Now"
- [ ] Complete recalibration
- [ ] Verify banner disappears after save
- [ ] Refresh page
- [ ] Verify banner doesn't reappear

### Scenario 2: First Day of Month (Already Recalibrated)
- [ ] Ensure recalibration was completed for current month
- [ ] Navigate to Sales Management
- [ ] Verify banner does NOT appear

### Scenario 3: Day 2-7 of Month (No Recalibration)
- [ ] Navigate to Sales Management
- [ ] Verify banner appears with modified text
- [ ] Verify text says "Monthly recalibration reminder..."

### Scenario 4: Dismiss and Revisit
- [ ] On a day when banner shows
- [ ] Click "Remind Me Later" or X button
- [ ] Verify banner disappears
- [ ] Refresh page or navigate away and back
- [ ] Verify banner reappears (session-based dismissal)

### Scenario 5: Day 8+ of Month
- [ ] Navigate to Sales Management on day 8 or later
- [ ] Verify banner does NOT appear (even if not recalibrated)

### Scenario 6: Multiple Stores (Cluster Head)
- [ ] As cluster head, select Store A
- [ ] Verify banner status for Store A
- [ ] Switch to Store B
- [ ] Verify banner status for Store B (independent check)

## Future Enhancements (Optional)

### 1. Persistent Dismissal
Store dismissal in localStorage or database with timestamp
- User can dismiss for 1 day, 3 days, etc.
- More control over reminder frequency

### 2. Notification Integration
Send push notification on the 1st of the month
- Remind users even if they don't visit the app
- Integrate with existing notification system

### 3. Extended Display Period
Make the display period configurable
- Some users may want to see it all month
- Others may want only first 3 days

### 4. Email Reminders
Send email reminder on the 1st if not completed
- Backup reminder system
- Better for users who don't check daily

### 5. Admin Dashboard
Show recalibration compliance across all stores
- Track which stores completed monthly recalibration
- Send reminders to non-compliant stores

## Conclusion

The monthly recalibration prompt feature successfully:
✅ Automatically detects when recalibration is needed
✅ Shows prominent, non-intrusive reminders
✅ Guides users through the recalibration process
✅ Tracks completion and hides prompt after done
✅ Integrates seamlessly with existing components
✅ Provides clear educational content
✅ Offers flexible dismissal options

This feature significantly improves the user experience by making monthly financial reconciliation a routine, guided process rather than a forgotten task.
