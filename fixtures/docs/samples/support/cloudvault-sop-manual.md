# Typhoon CloudVault — Customer Support Operations Manual

**Document Version:** 4.2  
**Last Updated:** March 2026  
**Approved By:** VP Customer Success & Support  
**Confidentiality:** Internal Use Only

---

## Table of Contents

1. [Customer Service Operations](#section-1-customer-service-operations)
2. [Account Management & Onboarding](#section-2-account-management--onboarding)
3. [Subscription & Billing Issues](#section-3-subscription--billing-issues)
4. [Sync & File Transfer Issues](#section-4-sync--file-transfer-issues)
5. [Security & Access Control](#section-5-security--access-control)
6. [Storage & Performance](#section-6-storage--performance)
7. [Desktop & Mobile App Troubleshooting](#section-7-desktop--mobile-app-troubleshooting)
8. [Enterprise & Team Features](#section-8-enterprise--team-features)
9. [Data Migration & Integration](#section-9-data-migration--integration)
10. [Escalation & Compensation](#section-10-escalation--compensation)
11. [Quality Assurance & Compliance](#section-11-quality-assurance--compliance)
12. [Appendices](#section-12-appendices)

---

## Section 1: Customer Service Operations

### 1.1 Service Level Agreements

CloudVault Support operates under the following SLA commitments:

| Channel           | Response Time | Resolution Target | Hours                 | Tier          |
| ----------------- | ------------- | ----------------- | --------------------- | ------------- |
| Email             | 4 hours       | 24 hours          | Business (M-F 9-6 PT) | Starter/Pro   |
| Chat              | 30 minutes    | 8 hours           | Business (M-F 9-6 PT) | Professional+ |
| Priority Email    | 1 hour        | 4 hours           | Business (M-F 9-6 PT) | Enterprise    |
| Phone Support     | 15 minutes    | 2 hours           | 24/7                  | Enterprise    |
| Critical Incident | 30 minutes    | 1 hour            | 24/7                  | Enterprise    |

**SLA Definitions:**

- **Response Time:** Time from ticket submission to first agent response
- **Resolution Target:** Expected time to full resolution (workaround or fix)
- **Hours:** Availability window for support channel
- **Tier:** Minimum subscription plan required for access

### 1.2 Ticket Classification & Priorities

All incoming support requests are classified into categories and assigned priority levels:

#### Ticket Categories

| Category        | Description                                                 | Common Issues                                                           | Assignment   |
| --------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- | ------------ |
| Account         | User account, authentication, profile settings              | Password reset, SSO setup, account recovery, email change               | L1 Agent     |
| Billing         | Subscriptions, invoicing, payments, refunds                 | Charge disputes, plan changes, upgrade/downgrade, invoice access        | Billing Team |
| Sync Issues     | File sync, conflicts, performance, bandwidth                | Files not syncing, conflict copies, slow sync, deleted files            | L1/L2 Agent  |
| App             | Desktop/mobile app installation, crashes, features          | App won't launch, crash reports, OS compatibility, updates              | L1 Agent     |
| Security        | Password compromise, 2FA, data breach concerns, permissions | Account compromised, 2FA errors, unauthorized access                    | L2/L3 Agent  |
| Sharing         | Share links, team folders, permissions, collaboration       | Permission denied, expired links, folder access issues                  | L1 Agent     |
| Migration       | Importing from other services, data migration               | Google Drive import failure, Dropbox migration, data loss during import | L2 Agent     |
| Enterprise      | SSO, audit logs, admin console, custom features             | SAML config, user provisioning, IP allowlists, compliance               | L3/Technical |
| Feature Request | Enhancement requests, product feedback                      | New features, integrations, UX improvements                             | Product Team |
| Abuse/Legal     | Spam, harassment, trademark, legal holds                    | Copyright infringement, data holds, litigation support                  | Legal Team   |

#### Priority Levels

| Priority      | Definition                                                           | Response Time | Examples                                                               | Escalation    |
| ------------- | -------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------- | ------------- |
| P1 - Critical | Complete service unavailability; data loss risk; >100 users affected | 15 min (24/7) | Entire account inaccessible, data corruption, breach confirmed         | VP Immediate  |
| P2 - High     | Major functionality broken; impacts workflow; 10-100 users affected  | 1 hour        | Cannot upload files, sync broken for team, account locked after breach | L3 within 1hr |
| P3 - Medium   | Feature partially broken; workaround available; <10 users affected   | 4 hours       | Share links not working, slow sync, specific file type issue           | L2 within 2hr |
| P4 - Low      | Minor issue; no workaround needed; cosmetic; feature request         | 24 hours      | UI glitch, documentation typo, feature inquiry                         | L1 response   |

### 1.3 Standard Greeting & Tone Guidelines

#### Phone Support Greeting (must use within 20 seconds of pickup)

> "Thank you for calling Typhoon CloudVault Support. My name is [NAME]. How can I help you today?"

Escalation greeting (after transfer):

> "Hi [NAME], this is [NEW AGENT] from our [TEAM] team. I've reviewed your case and I'm here to help. What's the current status?"

#### Chat Support Greeting

Initial message (must send within 2 minutes of conversation start):

```
Hi there! 👋 Welcome to Typhoon CloudVault Support. I'm [NAME].

What can I help you with today? (Quick tip: If you're experiencing sync issues, having your OS version and app version handy helps us troubleshoot faster!)
```

#### Tone Guidelines

✅ **DO:**

- Be empathetic and acknowledge the frustration ("I understand this is frustrating—let's get it fixed")
- Use their name once per interaction
- Provide specific next steps ("I'm sending you a link to check your file size")
- Be clear about timelines ("This should take 5-10 minutes")
- Offer alternatives ("If the desktop app isn't working, try the web interface as a workaround")
- Close with actionable summary ("I've sent you a support article, and I'll follow up tomorrow at 10am PT")

❌ **DON'T:**

- Use technical jargon without explanation ("Clear your .cloudvault-cache metadata index")
- Make promises you can't keep ("This will definitely be fixed by tomorrow")
- Blame the customer ("You probably didn't set up 2FA correctly")
- Leave tickets unresolved with vague next steps
- Ignore follow-ups for >24 hours

### 1.4 Escalation Matrix

```
L1 Agent (Frontline)
├─ Authority: $50 account credit max
├─ Handle: Basic troubleshooting, simple password resets, FAQ answers
├─ Escalate to L2 if: Technical diagnosis needed, policy exception, repeated issue
└─ Escalate to L3 if: Enterprise customer, security concern, legal flag

L2 Agent (Senior Support)
├─ Authority: $150 account credit, free month of service, short-term storage overage waiver
├─ Handle: Complex technical issues, app crashes, sync investigation, data recovery attempts
├─ Escalate to L3 if: Cannot reproduce, requires code fix, customer remains unsatisfied
└─ Escalate to Legal if: Abuse, harassment, IP claims, data holds

L3 Agent (Lead/Specialist)
├─ Authority: $500 credit, multiple months service, policy override (non-billing)
├─ Handle: Enterprise issues, security investigation, product edge cases, customer retention
├─ Escalate to VP if: Customer churn risk, media/press involvement, zero-day security
└─ Escalate to Legal if: Litigation, regulatory request, government takedown

Manager/Lead
├─ Authority: Unlimited within reason, policy exception approval
├─ Override: Can approve refunds, plan adjustments, custom solutions
└─ Escalation path for customer requests requiring director-level approval
```

### 1.5 Ticket Lifecycle

1. **Intake** (Agent receives): Acknowledge within SLA, ask clarifying questions, request account email + issue description
2. **Investigation** (0-2 hours): Reproduce issue, check account logs, test on multiple browsers/OS
3. **Initial Response** (must meet SLA): Propose solution (fix/workaround/escalation) or request more info
4. **Resolution** (ongoing): Guide customer through steps, verify fix, request confirmation
5. **Follow-up** (within 24 hours): Confirm issue resolved, provide prevention tips, request satisfaction survey
6. **Closure** (after 48 hours no response): Close ticket with summary, offer to reopen

**Key Metrics to Track:**

- First Response Time (target: beat SLA by 20%)
- Time to Resolution (track by category)
- Customer Satisfaction Score (CSAT 4.5+/5.0)
- Net Promoter Score (NPS 60+)
- First Contact Resolution Rate (target: 65%)

---

## Section 2: Account Management & Onboarding

### 2.1 Account Creation & Signup Flow

#### Step 2.1.1: New Account Verification

When a customer creates a new CloudVault account via app.typhooncloudvault.com:

1. Customer enters email address
2. Verification email sent (valid 24 hours)
3. Customer clicks link, sets password (complexity: 8+ chars, mix of case/numbers/symbols)
4. Account created in `active` state
5. 14-day free trial begins immediately

If verification link expires or customer doesn't receive email:

- Ask customer to check spam folder
- Resend verification link (max 3 attempts per email, then require wait 1 hour)
- If email domain is blocked, suggest corporate email alternative or phone verification

#### Step 2.1.2: Signup Issues & Resolution

| Issue                              | Cause                                     | Resolution                                                          |
| ---------------------------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| "Email already registered"         | Account exists with that email            | Direct to password reset link                                       |
| Verification email not received    | Spam filter, ISP block, typo              | Resend link, check alternate email, check corporate allowlist       |
| Password doesn't meet requirements | Too short, no numbers/symbols             | Display requirements clearly, suggest passphrase                    |
| Account creation times out         | Server error, network interruption        | Retry; if persists >5 min, escalate to L2                           |
| Cannot verify phone number (SMS)   | SIM swap, SMS delay, region not supported | Offer email verification instead, escalate to security for SIM swap |

**Timeout Handling:**

- Startup timeout (>30 sec): Show loading spinner, retry once, escalate if still fails
- Email not received (>5 min): Offer phone verification or temporary access to web app

### 2.2 Plan Upgrades & Downgrades

#### Upgrade Process (Starter → Professional → Enterprise)

1. Customer navigates to **Settings → Billing → Change Plan**
2. Select new tier, review pricing and features
3. Enter payment method if not on file
4. Upgrade applied immediately (prorated charge calculated)
5. New features (unlimited sync devices, team folders, etc.) active within 60 seconds

**Example:** Customer on Starter ($9/mo) upgrades to Professional ($19/mo) on day 15 of billing cycle:

- Original charge: $9 (15 days × $0.30/day)
- Upgrade prorated: 15 remaining days × $0.63/day = $9.45
- Total due: $9.45
- Next billing: Full $19 on day 30

#### Downgrade Process (Professional → Starter)

1. Customer requests downgrade via **Settings → Billing → Change Plan**
2. Confirm understanding: storage above Starter limit will be inaccessible (not deleted)
3. Apply downgrade at end of current billing period (not immediate)
4. Send warning email 7 days before downgrade effective

**Downgrade Restrictions:**

- Starter plan: 100 GB storage limit
- If customer using >100 GB, they get 7 days to delete files or upgrade back
- Files over quota are read-only after downgrade
- Files are NOT deleted; customer can reupgrade to re-access them

### 2.3 Free Trial Management

#### 14-Day Free Trial Policy

- **Who:** All new accounts
- **Duration:** Exactly 14 calendar days from account creation
- **Features:** Full access to all plan features during trial
- **Payment:** No credit card required during trial
- **Storage:** Temporary 1 TB quota during trial (not permanent)

#### Trial Expiration Handling

- **Day 12:** Automated email: "Your trial ends in 2 days. Choose a plan to continue"
- **Day 14 (11:59 PM PT):** Final reminder email with "Upgrade Now" button
- **Day 15 (12:01 AM PT):** Trial ends, account transitions to "read-only" state
- **Read-only state:** User can view/download files but cannot upload or delete
- **File retention:** Files preserved for 30 days after trial end
- **Day 45:** Files permanently deleted if plan not purchased

#### Trial Upgrade Conversion

If customer upgrades before trial end:

- Charge applied immediately (prorated for monthly plans)
- No refund for trial; trial days credited as discount is NOT offered
- Billing date set to calendar month (reset to 1st of following month)

**Example:** Customer signs up Jan 15, upgrades Jan 20 to Professional ($19/mo):

- Charge: $19 immediately (no proration; trial ends Jan 29)
- Next billing: Feb 1 (full $19 charge)
- Total paid Month 1: $19 (not $19 + partial)

#### Lapsed Trial Follow-up (Do Not Contact Spam Policy)

- **Day 16:** One follow-up email: "Your files are still here for 30 days"
- **Day 30:** Final email: "7 days to recover your files before deletion"
- **Day 46:** Files deleted; no further contact (GDPR/CAN-SPAM compliant)

---

## Section 3: Subscription & Billing Issues

### 3.1 Failed Payment Troubleshooting

When a customer's subscription payment fails:

#### Payment Failure Notification Sequence

| Day             | Action                                  | Channel                 | Message                                                     |
| --------------- | --------------------------------------- | ----------------------- | ----------------------------------------------------------- |
| Day 1 (Failure) | Automatic retry scheduled for Day 3     | Email                   | "Payment failed. We'll retry on [DATE]"                     |
| Day 3           | Second retry attempt                    | Email (if Day 1 failed) | "Your payment failed again. Update payment method."         |
| Day 7           | Account warning; features may downgrade | Email + In-App Banner   | "Your account will be downgraded to read-only in 7 days"    |
| Day 14          | Account enters grace period (read-only) | Email                   | "Your account is now read-only. Update payment to restore." |
| Day 30          | Files deleted; account closed           | Email                   | "Your CloudVault account has been closed"                   |

#### Common Payment Failure Error Codes

| Error Code  | Message                         | Customer Action                            | Agent Action                          |
| ----------- | ------------------------------- | ------------------------------------------ | ------------------------------------- |
| CVV-001     | Invalid CVV (security code)     | Re-enter correct 3/4-digit code            | Escalate to L2 if repeated            |
| CVV-002     | Card expired                    | Update to valid card                       | Check billing address mismatch        |
| AVS-001     | Address mismatch                | Verify address matches card issuer records | Ask for card statement copy           |
| DECLINE-001 | Card declined by issuer         | Contact bank; may be fraud block           | Offer alternative payment method      |
| DECLINE-002 | Insufficient funds              | Add funds to account; retry                | Process manually if customer confirms |
| 3DS-001     | 3D Secure authentication failed | Complete 3DS verification with bank        | Ask if customer has 3DS registered    |

#### Resolution Steps (Agent)

1. **Confirm customer identity** (account email + last 4 of card on file)
2. **Check billing history** — when did last successful charge occur?
3. **Identify error from payment processor** (Stripe, PayPal response)
4. **Resolve the issue:**
   - If CVV/expiration: Ask customer to update in Settings → Billing → Payment Method
   - If address mismatch: Verify address on file matches card issuer's records
   - If fraud block: Advise customer contact their bank to approve CloudVault as merchant
   - If insufficient funds: Offer to process payment again in 2-3 business days
5. **Trigger manual retry** after customer fixes payment method
6. **Monitor for success** within 24 hours; follow up if still fails

**Credit Card Update Flow:**

1. Customer goes to Settings → Billing → Payment Method
2. Click "Update Card"
3. Stripe tokenization form appears (PCI-compliant, encrypted)
4. Customer enters new card details
5. Charge retry triggers automatically
6. Confirmation email sent upon success

#### Special Case: Chargebacks & Disputes

If customer initiates chargeback on payment:

1. Stripe notifies us (usually 7-10 days after charge)
2. Escalate to Billing Manager immediately (within 24 hours)
3. Gather evidence (account activity logs, login history, email correspondence)
4. Prepare chargeback defense response within Stripe dashboard (48-hour window)
5. If chargeback sustained: Account flagged as "dispute" in CRM, do not allow re-signup for 90 days
6. Contact customer to resolve if still a value proposition (offer discount on future subscription)

### 3.2 Refund Requests & Policy

#### Refund Eligibility Matrix

| Plan Type  | Within Window | Condition          | Refund Amount | Notes                                        |
| ---------- | ------------- | ------------------ | ------------- | -------------------------------------------- |
| Monthly    | ≤7 days       | Any reason         | 100%          | Including day of purchase                    |
| Monthly    | >7 days       | Any reason         | $0            | No refund; can downgrade/cancel              |
| Annual     | ≤60 days      | Any reason         | Prorated      | Unused months × ($annual / 12)               |
| Annual     | >60 days      | Any reason         | $0            | No refund; cancellation stops future charges |
| Enterprise | Per MSA       | Per contract terms | Per MSA       | Contact account manager                      |
| Free Trial | N/A           | N/A                | N/A           | No charges; no refund applicable             |

#### How Customers Request Refunds

**Option 1: Self-Service (Recommended)**

1. Go to **Settings → Billing → Subscription**
2. Click **Cancel Subscription** → **Request Refund** (if eligible)
3. Select reason (optional)
4. Automatic refund processed within 5-10 business days

**Option 2: Support Request**

1. Contact support@typhooncloudvault.com with subject "Refund Request"
2. Include account email and order ID
3. Agent verifies eligibility and processes manually

#### Refund Processing Times

| Payment Method | Processing Time     | Verification                                |
| -------------- | ------------------- | ------------------------------------------- |
| Credit Card    | 5-10 business days  | Monitor customer's bank statement           |
| PayPal         | 3-5 business days   | PayPal confirmation email sent              |
| Wire Transfer  | 10-15 business days | Rare; requires manual processing by Finance |
| Apple/Google   | 7-14 days           | Refund goes through respective app store    |

#### Refund Processing (Agent Workflow)

1. **Verify eligibility:** Check purchase date, plan type, refund window
   - If ineligible: Explain policy clearly, offer alternatives (downgrade, pause, discount on next month)
   - If eligible: Proceed to step 2
2. **Prepare refund:** Gather customer info (account email, card last 4 digits)
3. **Process refund:** In Stripe dashboard, click "Refund charge"
   - Full refund: Select "Refund full amount"
   - Partial refund (pro-rata): Enter calculated amount (use calculator in billing system)
4. **Verify processing:** Check Stripe confirms "Refund initiated"
5. **Notify customer:** Send confirmation email with refund amount, expected timeline, and confirmation number
6. **Document case:** Add note in CRM: "Refund processed. Reason: [reason]. Amount: $[X]. Expected receipt: [DATE]"

#### Refund Denial Protocol

If customer is ineligible:

```
Subject: Refund Request — [Account Email]

Hi [NAME],

Thank you for your refund request. I've reviewed your subscription:

- Plan: Professional ($19/month)
- Purchase Date: [DATE]
- Current Date: [DATE]
- Days Since Purchase: [X] days

Per our refund policy, refunds are available within 7 days of purchase for monthly plans.
Your purchase was [X] days ago, which is outside the refund window.

Options available to you:
1. Cancel your subscription effective immediately (no refund, but no future charges)
2. Downgrade to our Starter plan ($9/month) starting [DATE]
3. Pause your subscription for up to 30 days (if eligible)

Would any of these options work for you? I'm happy to help process one of them.

Best,
[AGENT NAME]
Support Team
```

### 3.3 Promo Codes & Discounts

#### Promo Code Database

Promo codes are managed in our promotions system with expiration and usage limits.

#### Valid Promo Code Types

| Code Type    | Description                   | Example                               | Duration                         |
| ------------ | ----------------------------- | ------------------------------------- | -------------------------------- |
| New Customer | First purchase discount       | WELCOME20 (20% off first month)       | Jan 2026 - Dec 2026              |
| Seasonal     | Holiday/event promotions      | SPRING25 (25% off 3 months)           | Seasonal windows only            |
| Partner      | Integration partner referrals | ZAPIER15 (15% off annual)             | Ongoing; per partner agreement   |
| Loyalty      | Returning customer incentive  | COMEBACK10 (10% off 6 months)         | Valid 60 days after cancellation |
| Education    | Academic institutions         | STUDENT30 (30% off with .edu email)   | Ongoing; verification required   |
| Charity      | Nonprofit discount            | NONPROFIT50 (50% off with 501c3 cert) | Ongoing; annual verification     |

#### Promo Code Application & Rules

1. **During Signup:** Customer enters code before selecting plan
2. **During Billing:** Customer can apply code in Settings → Billing → Promo Code (within 7 days of first purchase)
3. **Stacking:** Multiple codes are NOT stackable. Only one code per subscription.
4. **Combining with trials:** Free trial + promo code NOT allowed. Customer must upgrade from trial or buy on discount, not both.
5. **Refunds with promo:** If refund issued, discounted amount is refunded (pro-rata).

#### Promo Code Troubleshooting

| Issue               | Solution                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Code not recognized | Check for typo; verify code is active (not expired)                                           |
| Code not applying   | Check code already used (one-time limit), or customer ineligible (must be new account)        |
| Expired code        | Cannot be reactivated; offer closest valid alternative or L2 manager discretion for extension |
| Code amount unclear | Direct customer to terms (usually shown during checkout)                                      |

---

## Section 4: Sync & File Transfer Issues

### 4.1 Files Not Syncing — Diagnostic Flowchart

```
Customer reports: "My files aren't syncing"

STEP 1: Verify Sync Status
├─ Ask: "Are you seeing the CloudVault app in your system tray/menu bar?"
├─ YES → Continue to STEP 2
└─ NO → Desktop app may not be running
    └─ Action: Restart desktop app (Menu → Restart)

STEP 2: Check Internet Connection
├─ Ask: "Can you open a website like google.com right now?"
├─ YES → Continue to STEP 3
└─ NO → Internet is down
    └─ Action: Wait for connection restoration; CloudVault will auto-sync when online

STEP 3: Verify File Location
├─ Ask: "Is the file inside your CloudVault folder? (Default: ~/CloudVault or C:\Users\[NAME]\CloudVault)"
├─ YES → Continue to STEP 4
└─ NO → File is outside sync folder
    └─ Action: Move file into CloudVault folder; sync will begin within 60 seconds

STEP 4: Check File Size Limit
├─ File size ≤ plan limit? (Starter 15GB, Pro 50GB, Enterprise 100GB)
├─ YES → Continue to STEP 5
└─ NO → File exceeds limit
    └─ Action: Upgrade plan or split file into smaller chunks

STEP 5: Check for Conflicts
├─ Is there a file named "[FILENAME] (conflict [DATE]).[EXT]"?
├─ YES → Conflict detected
│   └─ Action: Keep correct version, delete conflict copy; restart app
└─ NO → Continue to STEP 6

STEP 6: Check Sync Folder Settings
├─ In app → Settings → Sync Folder, is sync enabled?
├─ YES → Continue to STEP 7
└─ NO → Sync is disabled
    └─ Action: Click toggle to enable sync; wait 2 minutes

STEP 7: Restart App & Check Logs
├─ Right-click CloudVault icon → Restart
├─ Wait 2 minutes, check if file appears
├─ YES → Resolved!
└─ NO → Continue to STEP 8

STEP 8: Check Detailed Logs
├─ Open app → Settings → Diagnostics
├─ Click "Generate Support Bundle" and send to support
├─ Take screenshot of sync status screen
└─ Action: Escalate to L2 with bundle + screenshot
```

### 4.2 Common Sync Errors & Resolutions

| Error Message               | Code     | Cause                                   | Resolution                                                     | Escalation |
| --------------------------- | -------- | --------------------------------------- | -------------------------------------------------------------- | ---------- |
| "Cannot access sync folder" | SYNC-001 | Permissions issue; folder deleted       | Check folder exists, restore if deleted, grant app permissions | L1         |
| "Out of storage"            | SYNC-002 | Account quota full                      | Delete files or upgrade plan                                   | L1         |
| "File too large"            | SYNC-003 | Exceeds plan limit                      | Split file or upgrade                                          | L1         |
| "Sync taking too long"      | SYNC-004 | Large file or slow network              | Check file size, test on faster network                        | L1         |
| "Conflict copy created"     | SYNC-005 | Simultaneous edits on 2+ devices        | Keep correct version, delete conflict                          | L1         |
| "Cannot write to cloud"     | SYNC-006 | Permission denied on account            | Check team folder permissions, contact owner                   | L1         |
| "Sync paused"               | SYNC-007 | Manual pause or error threshold reached | Resume sync in app settings                                    | L1         |
| "Database corruption"       | SYNC-008 | Local cache corrupted                   | Delete `.cloudvault-cache`, restart app                        | L2         |
| "Antivirus blocking"        | SYNC-009 | Antivirus scanning/blocking CloudVault  | Add to antivirus exclusion list                                | L1         |
| "Unable to authenticate"    | SYNC-010 | Session expired or 2FA issue            | Re-authenticate in app, check 2FA code                         | L1         |

### 4.3 Deleted File Recovery

**Customer says: "I accidentally deleted a file. Can you recover it?"**

#### Recovery Eligibility

| Plan         | Version History | Retention  | Recovery Time                          |
| ------------ | --------------- | ---------- | -------------------------------------- |
| Starter      | 30 days         | 30 days    | Up to 30 days old                      |
| Professional | 1 year          | 365 days   | Up to 1 year old                       |
| Enterprise   | Unlimited       | Indefinite | Any time (limit 100 versions per file) |

#### Recovery Process (Agent)

1. **Confirm deletion date:** "When did you delete the file? [DATE]"
2. **Check eligibility:** Compare deletion date to version history window
   - Within window → Proceed to step 3
   - Outside window → File permanently deleted, apologize and explain retention policy
3. **Verify file details:** Ask for file name, approximate size, last known location
4. **Request customer to initiate recovery:**
   - Web interface: Click on file → **History** → Select previous version → **Restore**
   - Desktop app: Right-click file location → **Restore from History**
5. **Verify restoration:** Follow up within 2 hours to confirm file is recovered
6. **Log recovery:** Document in case "File recovery requested and completed for [FILENAME]"

#### If File is Outside Retention Window

```
Hi [NAME],

I reviewed your account and the file you're looking for was deleted on [DATE].
Unfortunately, our version history only retains files for [DURATION] (your plan includes [RETENTION]).

Since your deletion was [DAYS] days ago, the file is no longer recoverable.

What I can offer:
1. I'll check our backup systems (24-48 hour process, no guarantee)
2. Upgrade to a plan with longer history to prevent this in the future

Would you like me to escalate this for backup recovery, or upgrade your plan?

Best,
[AGENT NAME]
```

If customer wants us to check backups:

- Escalate to L2 (Database Recovery team)
- Provide file name, owner email, deletion date
- Recovery attempt takes 24-48 hours; notify customer of outcome

---

## Section 5: Security & Access Control

### 5.1 Password Reset & Account Recovery

#### Forgot Password Flow

**When customer clicks "Forgot Password" on login page:**

1. Customer enters account email address
2. Verification email sent to address on file (valid 24 hours)
3. Email contains "Reset Password" link
4. Customer clicks link → Create new password form appears
5. New password requirements: 8+ characters, mixed case, 1+ number, 1+ symbol
6. Password updated; customer redirected to login page
7. Login with new password succeeds

**If email not received:**

- Check spam/junk folder
- Resend link (max 3 attempts, then require 1-hour wait)
- Verify email is correct (typo? different email registered?)
- If still not received, escalate to L2 for manual verification

#### Password Reset Security

- Links expire after 24 hours
- Links are single-use (cannot be reused)
- Clicking link logs customer out of all other sessions
- IP address is logged for security monitoring
- Unusual reset (e.g., different country) triggers review

#### Locked Account Recovery

**Account locks after 5 failed login attempts within 15 minutes:**

1. Customer sees message: "Account temporarily locked. Try again in 15 minutes."
2. After 15 minutes, login is allowed again
3. If customer forgets password: Click "Forgot Password" to reset
4. If account is locked AND customer forgot password: Contact support
   - Verify identity (security questions or account creation email)
   - Reset password manually (sends new password to verified email)
   - Customer logs in with temporary password
   - Forced to change password on first login

### 5.2 Two-Factor Authentication (2FA)

#### 2FA Setup Process

1. Go to **Settings → Security → Two-Factor Authentication**
2. Click **Enable 2FA**
3. Select method:
   - **SMS (SMS/Text):** Receive codes via text message
   - **Authenticator App:** Use Google Authenticator, Authy, Microsoft Authenticator
4. If SMS:
   - Enter phone number
   - Verify with test code sent via SMS
   - Save backup codes (10 codes for emergency access)
5. If Authenticator:
   - Scan QR code with app
   - App displays 6-digit code
   - Enter code to verify
   - Save backup codes
6. Confirmation: "2FA is now enabled. Your account is protected."

#### 2FA Login Flow

1. Customer enters email and password
2. System displays: "Enter the 6-digit code from your authenticator app (or SMS)"
3. Customer enters code (valid for 30 seconds)
4. If code correct: Login succeeds
5. If code wrong: Show error "Invalid code. Please try again." (allow 3 attempts, then ask for backup code)
6. If customer lost authenticator:
   - Ask for one of 10 backup codes
   - Use backup code once, then regenerate remaining codes
   - Escalate to L2 if customer lost all backup codes

#### Common 2FA Issues & Resolution

| Issue                | Cause                              | Resolution                                                                        |
| -------------------- | ---------------------------------- | --------------------------------------------------------------------------------- |
| "Code doesn't work"  | Expired (refreshes every 30sec)    | Ask to try next code; time may be out of sync                                     |
| Code always wrong    | Authenticator app time out of sync | Reset phone time to automatic; reinstall app                                      |
| Lost phone with 2FA  | Phone reset or stolen              | Use backup codes if available; escalate to L2 for identity verification and reset |
| "Didn't receive SMS" | SMS delay or number wrong          | Check number is correct; try again; escalate to L2 if persistent                  |
| Can't disable 2FA    | Password needed for security       | Ask customer to reset password first, then disable 2FA                            |

### 5.3 Compromised Account Response

**When customer reports: "My account was hacked" or "I see activity I didn't do"**

#### Immediate Actions (First 30 Minutes)

1. **Listen & empathize:**

   > "I'm sorry to hear that. Let's secure your account right now. I'm going to walk you through the steps."

2. **Force logout of all sessions:**
   - In CRM, mark account as "security incident"
   - Trigger "Logout All Sessions" command
   - This invalidates all active login tokens immediately
   - Customer cannot access account even if attacker is currently logged in

3. **Freeze high-risk actions temporarily** (30 minutes):
   - Prevent sharing link creation
   - Prevent permission changes
   - Prevent plan downgrades
   - Prevent API token creation

4. **Initiate password reset:**
   - Send manual password reset link to customer
   - Customer creates new strong password (15+ chars recommended)
   - Confirm reset complete

5. **Disable unusual integrations:**
   - Ask if customer authorized apps in Settings → Connected Apps
   - If unfamiliar apps listed (e.g., "Random PDF Converter"), revoke access immediately
   - Block any API tokens customer doesn't recognize

#### Investigation (30 Minutes - 2 Hours)

6. **Review account logs:**
   - Check login history (unusual locations, times, IPs)
   - Check file access history (files accessed you don't recognize)
   - Check sharing changes (files shared with unknown emails)
   - Screenshot logs for evidence

7. **Determine scope of compromise:**
   - How many files were accessed/modified?
   - Were files shared externally?
   - Was 2FA enabled? (If not, attacker had unrestricted access)
   - Do we see evidence of data exfiltration?

8. **Report to customer:**

   ```
   We've reviewed your account and found:
   - [X] unauthorized login(s) from [LOCATION]
   - [FILES MODIFIED/SHARED] on [DATE]
   - All sessions have been logged out
   - Your password has been reset

   Recommended next steps:
   1. Change passwords for other services that share same password
   2. Monitor bank accounts for fraudulent charges
   3. Enable 2FA if not already enabled
   4. Review and revoke connected apps (Settings → Connected Apps)
   ```

#### Notification & Follow-up

9. **Escalate to L3 Security Team** (within 2 hours):
   - Complete case file with logs, timeline, scope
   - Mark as `SECURITY-INCIDENT`
   - Escalate to Legal if evidence of data exfiltration or criminal activity

10. **Customer communication:**
    - Email confirmation of incident + actions taken
    - 24-hour follow-up: "Have you recovered all files? Any questions?"
    - Offer 1 month free service as goodwill gesture (L3 authority)

#### Prevention Messaging

After resolution, educate customer:

```
To prevent future compromises:

1. Enable 2FA — makes accounts nearly impossible to hack
   Settings → Security → Two-Factor Authentication

2. Use unique, strong passwords
   - Avoid reusing passwords across websites
   - Use 15+ characters with mixed case, numbers, symbols

3. Monitor Connected Apps
   - Settings → Connected Apps
   - Revoke unfamiliar integrations

4. Keep your device secure
   - Run antivirus scans regularly
   - Update OS and browsers

5. Contact us immediately if you notice anything unusual
```

---

## Section 6: Storage & Performance

### 6.1 Storage Quota Management

#### Storage Limits by Plan

| Plan         | Total Quota             | Per-File Limit | Behavior When Full                     |
| ------------ | ----------------------- | -------------- | -------------------------------------- |
| Starter      | 100 GB                  | 15 GB          | Cannot upload; warning at 90%          |
| Professional | 1 TB (1000 GB)          | 50 GB          | Cannot upload; warning at 90%          |
| Enterprise   | Unlimited (contractual) | 100 GB         | Alert at 500 GB/1TB/5TB (configurable) |

#### Storage Usage Calculation

- **Counted towards quota:** All files, including versions and file copies
- **NOT counted:** Deleted files (counted until purged), shared access only (via share links)
- **Version history:** Separate line item; counts toward total quota

Example: 50 GB in current files + 20 GB in 30-day version history = 70 GB used (out of 100 GB for Starter)

#### Quota Warnings & Actions

| Usage Level | Notification            | Action                             | Timeline                               |
| ----------- | ----------------------- | ---------------------------------- | -------------------------------------- |
| 75%         | Email warning           | None; informational                | Sent immediately                       |
| 90%         | Email + In-app banner   | Offer upgrade link                 | Sent immediately                       |
| 100%        | Email + Blocking banner | Cannot upload; escalate to support | Upload rejected with error `QUOTA-001` |

#### Storage Cleanup Guidance (Agent)

When customer reports "I'm out of storage", ask:

1. **"Do you need to keep all versions of your files?"**
   - If NO: Suggest purging old versions (Settings → Storage → Auto-delete versions older than 30 days)
   - This frees up space without losing current files

2. **"Are there files you no longer need?"**
   - Check file list; help identify old projects, archived documents
   - Delete old files, empty trash (Settings → Trash → Empty)

3. **"Would upgrading your plan help?"**
   - Pro: +900 GB for $10/month
   - Enterprise: Unlimited, dedicated support
   - Send upgrade link in Settings → Billing

4. **"Do you have duplicate files?"**
   - Ask to check for "copy of [FILE]" or versioned files
   - Consolidate duplicates manually

### 6.2 Sync Performance Optimization

#### Troubleshooting Slow Sync

When customer reports "Sync is really slow":

**Step 1: Identify scale of issue**

```
Questions to ask:
- How many files/folders are in your CloudVault? (Helps determine indexing time)
- Is it slow when uploading, downloading, or both?
- Are there many small files (1,000+) or larger files?
- What's your internet speed? (Test at speedtest.net)
- How much free disk space on your computer? (<500 MB slows sync)
```

**Step 2: Common causes & fixes**

| Cause                         | Symptom                   | Fix                                                     |
| ----------------------------- | ------------------------- | ------------------------------------------------------- |
| Antivirus scanning every file | Sync pauses frequently    | Add CloudVault folder to AV exclusion list              |
| Slow internet                 | Upload very slow          | Check internet speed; test on faster network            |
| Too many small files          | Sync indexing takes hours | Zip/archive old files to reduce file count              |
| Low disk space                | Sync pauses at random     | Free up 500+ MB on drive; restart app                   |
| VPN latency                   | Uploads to cloud slow     | Connect to VPN server near your data region             |
| Bandwidth throttled           | Upload speed capped       | Settings → Network → Bandwidth Limit (increase)         |
| Large initial sync            | First sync after install  | Check "Sync Status" in app; initial sync can take hours |

**Step 3: Monitoring improvements**

After fix:

- Ask customer to check **Settings → Sync Status** in 1 hour
- If uploading rate increases (KB/sec), fix worked
- If still slow, escalate to L2

#### Recommended Sync Settings for Performance

```
Settings → Performance (Advanced)

Bandwidth Limit: 90% (default 80%)
  └─ Uses more of your available bandwidth

Selective Sync: Remove folders not needed locally
  └─ Syncs only what you use; frees local storage

Bandwidth Priority: "Sync speed over CPU"
  └─ Reduces system impact; slightly longer sync time

Conflict Detection: "Automatic" (keep both versions)
  └─ Resolves conflicts without blocking sync
```

---

## Section 7: Desktop & Mobile App Troubleshooting

### 7.1 Desktop App Installation & Compatibility

#### System Requirements

| OS      | Minimum Version  | Disk Space | RAM  | Notes                                 |
| ------- | ---------------- | ---------- | ---- | ------------------------------------- |
| Windows | 10 (Build 1909+) | 500 MB     | 4 GB | .NET Framework 4.8+ required          |
| macOS   | 12 Monterey      | 500 MB     | 4 GB | Intel & Apple Silicon (M1/M2) support |
| Linux   | Ubuntu 22.04 LTS | 500 MB     | 4 GB | Also supports Fedora 37+, Debian 12   |

#### Installation Troubleshooting

| Issue                   | Cause                                   | Solution                                                 |
| ----------------------- | --------------------------------------- | -------------------------------------------------------- |
| "Installation failed"   | Missing .NET Framework (Windows)        | Download .NET 4.8 from microsoft.com; retry install      |
| App won't launch        | Corrupted installation                  | Uninstall completely → Restart → Reinstall               |
| "File in use" error     | App still running from previous session | Restart computer; retry install                          |
| Permission denied (Mac) | OS prevents unsigned app                | Go to Settings → Security & Privacy → Allow "CloudVault" |

### 7.2 App Crash Diagnosis

**Customer reports: "The CloudVault app keeps crashing"**

#### Step 1: Gather Crash Details

Ask customer:

```
1. When does it crash? (On startup, during sync, after clicking button?)
2. Have you updated your OS recently?
3. Do you see an error message before crash?
4. How many files are in your CloudVault?
5. Is your disk almost full?
```

#### Step 2: Generate Diagnostic Bundle

Guide customer:

1. Open CloudVault app
2. Go to **Settings → Diagnostics**
3. Click **Generate Support Bundle** (takes 1-2 minutes)
4. Bundle saved to `~/Downloads/CloudVault-Diagnostics-[DATE].zip`
5. Email to support@typhooncloudvault.com with description of crash

#### Step 3: Quick Fixes

1. **Clear app cache:**
   - Mac: Delete `~/.cloudvault-cache/` folder
   - Windows: Delete `%APPDATA%\CloudVault\cache\`
   - Linux: Delete `~/.cloudvault-cache/`
   - Restart app

2. **Update OS & app:**
   - Check for macOS/Windows/Linux updates (Settings → System Updates)
   - Update CloudVault to latest (app → Help → Check for Updates)

3. **Check disk space:**
   - Mac: Click Apple → About → Storage
   - Windows: Settings → System → Storage
   - If <500 MB free, delete files and retry

4. **Uninstall/reinstall:**
   - Uninstall app (Windows: Control Panel → Programs → Uninstall)
   - Restart computer
   - Reinstall from app.typhooncloudvault.com/download

#### Step 4: If Still Crashing

- Escalate to L2 with diagnostic bundle
- Avoid sync'ing large files until resolved
- Offer temporary web interface as workaround

### 7.3 Mobile App Troubleshooting

#### Common Mobile Issues

| Issue                        | iOS/Android | Solution                                                                          |
| ---------------------------- | ----------- | --------------------------------------------------------------------------------- |
| App won't open               | Both        | Force close app; restart phone; update app from App Store/Play Store              |
| Login fails                  | Both        | Check 2FA code is fresh (<30 sec old); verify internet connection; reset password |
| Cannot upload photos         | Both        | Check app has permission (Settings → Photos → Allow Access); check storage quota  |
| Offline access not working   | Both        | Photos are cached automatically; if not appearing, download manually              |
| Automatic backup not working | Both        | Enable in app → Settings → Backup; verify Wi-Fi + USB connected if required       |

#### Mobile App Auto-Backup Setup

**iOS:**

1. Open CloudVault app
2. Tap **Settings → Backup & Sync**
3. Enable "Automatic Photo Backup"
4. Select "WiFi + Cellular" or "WiFi Only"
5. Photos automatically upload when connected

**Android:**

1. Open CloudVault app
2. Tap **⋮ (menu) → Settings → Backup**
3. Enable "Backup Photos & Videos"
4. Grant permission to access Photos
5. Select backup frequency (Real-time, Daily, Weekly)

---

## Section 8: Enterprise & Team Features

### 8.1 Team Folder Permissions & Management

#### Team Folder Types & Permissions

| Permission Level | Can View | Can Edit | Can Share | Can Invite | Can Delete     |
| ---------------- | -------- | -------- | --------- | ---------- | -------------- |
| Owner            | Yes      | Yes      | Yes       | Yes        | Yes            |
| Admin            | Yes      | Yes      | Yes       | Yes        | Yes            |
| Editor           | Yes      | Yes      | No        | No         | Yes            |
| Contributor      | Yes      | Yes      | No        | No         | Own files only |
| Viewer           | Yes      | No       | No        | No         | No             |

#### Adding Team Members to Folder

1. Go to Team Folder → Click **⋮ (menu) → Invite Members**
2. Enter email address of team member
3. Select permission level (Owner, Admin, Editor, Contributor, Viewer)
4. Set optional expiration date (auto-removes access on date)
5. Click **Send Invite**
6. Invitee receives email; clicks "Join Folder"
7. Folder appears in their CloudVault and syncs locally

#### Permission Change & Removal

1. Go to Team Folder → Click **⋮ → Manage Members**
2. Find member in list
3. To change permission: Click permission level → Select new level
4. To remove: Click **X** button → Confirm "Remove Access"
5. Member's access revoked immediately; folder disappears from their account

### 8.2 SSO & SAML Integration (Enterprise)

#### SSO Configuration Checklist

For Enterprise customers with existing SSO (Okta, Azure AD, Google Workspace):

| Step | Action                                              | Owner              | Timeline |
| ---- | --------------------------------------------------- | ------------------ | -------- |
| 1    | Customer provides SSO details (IdP, SAML endpoint)  | Customer           | Day 1    |
| 2    | CloudVault Support configures SAML in admin console | L3 Technical       | Day 1    |
| 3    | Test login with test account                        | Customer + Support | Day 2    |
| 4    | Customer trains users on SSO login                  | Customer           | Day 2-3  |
| 5    | Enable SSO for all users; disable password login    | Customer           | Day 3    |

#### SSO Login Flow

1. User navigates to app.typhooncloudvault.com
2. Clicks **Sign in with Company SSO**
3. Redirected to customer's SSO login page (e.g., Okta)
4. User enters credentials
5. SSO provider verifies identity
6. Redirects back to CloudVault with assertion
7. User logged into CloudVault automatically

#### Common SSO Issues

| Issue                          | Cause                                          | Resolution                                               |
| ------------------------------ | ---------------------------------------------- | -------------------------------------------------------- |
| "Invalid SAML assertion"       | Certificate expired or misconfigured           | Regenerate SAML certificate in admin console; update IdP |
| "User not found"               | Email in SAML doesn't match CloudVault account | Ensure SAML email matches user's CloudVault email        |
| Redirect loop                  | Misconfigured callback URL                     | Verify cloudvault.com is in IdP's allowed redirect URIs  |
| Users still see password login | SSO not fully enabled                          | Contact L3 to disable password authentication globally   |

---

## Section 9: Data Migration & Integration

### 9.1 Importing from Google Drive, Dropbox, OneDrive

#### Migration Tool Overview

CloudVault includes a free migration tool supporting:

- **Google Drive** — All files and folder structure
- **Dropbox** — All files and folder structure
- **OneDrive** — All files and folder structure
- **Box** — All files and folder structure

#### Migration Process (Customer-Initiated)

1. Go to **Settings → Import Files**
2. Select source (Google Drive, Dropbox, OneDrive, Box)
3. Click **Connect Account** → Grant permissions in source service
4. Select folders to import (or "Import All")
5. Click **Start Migration**
6. Background process begins; customer can work while migrating
7. Progress shown in **Settings → Import Status**
8. Notification when complete; migrated files in `/Imports/[SOURCE]/`

#### Migration Timeline

| Source                  | File Count          | Expected Time |
| ----------------------- | ------------------- | ------------- |
| Google Drive            | 1,000 files         | 1-2 hours     |
| Dropbox                 | 10,000 files        | 4-8 hours     |
| OneDrive                | 50,000 files        | 12-24 hours   |
| Large files (>1GB each) | Add 30 min per file | Varies        |

#### Migration Troubleshooting

| Issue                | Cause                      | Solution                                         |
| -------------------- | -------------------------- | ------------------------------------------------ |
| "Permission denied"  | OAuth token revoked        | Re-connect account in Import Settings            |
| Migration stuck      | Network error or timeout   | Restart migration; if >24 hours, escalate        |
| Files not imported   | Storage quota full         | Upgrade plan before importing                    |
| Wrong files imported | User selected wrong folder | Cancel migration, select correct folder, restart |

#### Managed Migration (Large Customers)

For customers migrating >5 TB:

1. Escalate to Migration Services team
2. Schedule migration window (usually off-hours)
3. Support coordinates with customer's IT
4. Direct server-to-server transfer (faster, no OAuth limits)
5. Handoff and validation post-migration

---

## Section 10: Escalation & Compensation

### 10.1 L1 Support Authority & Limits

**L1 Agents can:**

- Troubleshoot basic issues
- Reset passwords, resets 2FA
- Process billing questions
- Explain policies
- Apply up to **$50 in account credit**

**L1 Agents must escalate (L2) if:**

- Issue cannot be resolved in <2 hours
- Customer requests manager
- Security concerns (account compromise, data breach)
- Requires code investigation or data recovery
- Customer is unhappy despite troubleshooting

### 10.2 L2 Support Authority & Limits

**L2 Agents can:**

- Investigate complex technical issues
- Access account logs and file history
- Attempt data recovery
- Process refunds within policy
- Apply up to **$150 in account credit**
- Offer 1 month free service as compensation

**L2 Agents must escalate (L3) if:**

- Customer still unsatisfied
- Requires policy override
- Security incident with potential data loss
- Customer threatens legal action
- Media/press involvement

### 10.3 Compensation Guidelines

Compensation (account credit or free service) is offered when:

1. **Service failure:** Unplanned downtime >4 hours
2. **Data loss:** Files deleted by us, not customer
3. **Support failure:** We don't respond to ticket within SLA
4. **Billing error:** Incorrect charges, failed refunds
5. **Product defect:** Feature broken, app crashes

#### Approved Compensation Table

| Incident                        | Amount                          | Authority | Notes                                      |
| ------------------------------- | ------------------------------- | --------- | ------------------------------------------ |
| Late support response (4-8 hrs) | $10 credit                      | L1        | If within 7 days of incident               |
| Late support response (>8 hrs)  | $25 credit                      | L2        | Document response time                     |
| Service downtime (<1 hr)        | $15 credit                      | L1        | Automatic if >100 users affected           |
| Service downtime (1-4 hrs)      | $50 credit                      | L2        | Pro-rata 1/30th of monthly fee             |
| Service downtime (>4 hrs)       | 1 month free                    | L3        | Or $150 credit if approaching cancellation |
| Data loss (unrecoverable)       | Full month free + investigation | L3        | + formal incident report                   |
| Billing error ($50+)            | Full refund + $25 credit        | L2        | Prevent chargeback                         |
| Repeated issues (3+ tickets)    | 3 months discount (25%)         | L3        | Retention offer                            |

#### Compensation Offer Script

```
Hi [NAME],

I sincerely apologize for [ISSUE]. I understand how frustrating that must be.

To make this right, I'd like to offer you [COMPENSATION] as a gesture of goodwill:
- [CREDIT AMOUNT] account credit, or
- [MONTHS] free service on your next billing, or
- Upgrade to [PLAN] at no additional cost for [DURATION]

This has been applied to your account effective immediately. You'll see it reflected
in your next invoice.

Is there anything else I can do to restore your confidence in CloudVault?

Best,
[AGENT NAME]
```

---

## Section 11: Quality Assurance & Compliance

### 11.1 Call Monitoring & Coaching

#### Monthly Evaluation Scorecard

All agent calls are monitored and scored on 5-point scale:

| Metric                    | 5 = Excellent                       | 4 = Good                        | 3 = Satisfactory          | 2 = Needs Improvement    | 1 = Poor           |
| ------------------------- | ----------------------------------- | ------------------------------- | ------------------------- | ------------------------ | ------------------ |
| **Greeting**              | Professional, warm, immediate       | Professional, slight delay      | Professional, no warmth   | Vague greeting, delay    | No greeting / rude |
| **Problem Clarification** | Asks detailed Qs; full context      | Asks key questions              | Asks basic questions      | Limited clarification    | No questioning     |
| **Technical Knowledge**   | Knowledgeable; guides customer      | Knows troubleshooting steps     | Follows runbook correctly | Uncertain, suggests docs | Wrong info given   |
| **Resolution**            | Full resolution + follow-up         | Resolves issue; brief follow-up | Resolves issue            | Partial resolution       | Issue remains      |
| **Soft Skills**           | Empathetic, patient, builds rapport | Professional, courteous         | Neutral tone              | Curt, impatient          | Rude, dismissive   |
| **Compliance**            | Never shares password; PII secure   | Follows security protocol       | Mostly secure             | Minor security slip      | Violates policy    |
| **Efficiency**            | Quick resolution; respects time     | Reasonably efficient            | Adequate pace             | Slow; long-winded        | Very slow          |

**Scoring:** Average of 7 metrics. Target ≥4.0/5.0.

#### Coaching Framework

| Score   | Action                                       | Timeline           |
| ------- | -------------------------------------------- | ------------------ |
| 4.5+    | Recognition; highlight as example            | Monthly team call  |
| 4.0-4.4 | Continue current approach; note strengths    | Quarterly feedback |
| 3.5-3.9 | Coaching plan; identify 1-2 areas to improve | Bi-weekly 1:1      |
| 3.0-3.4 | Formal improvement plan; training            | Weekly 1:1         |
| <3.0    | Performance discussion; capability review    | Immediate          |

#### CSAT & NPS Targets

**Customer Satisfaction (CSAT) — After each ticket**

- Scale: 1-5 stars
- Target: ≥4.5/5.0 average
- Issues scoring <3: Investigate root cause and coach agent

**Net Promoter Score (NPS) — Monthly survey to random customers**

- Question: "How likely would you recommend CloudVault to a friend?"
- Scale: 0-10 (promoters 9-10, passives 7-8, detractors 0-6)
- Target: ≥60 NPS
- Detractors contacted within 24 hours for follow-up

### 11.2 Compliance & Security Requirements

#### PCI-DSS Compliance (Payment Processing)

All agents handling credit card data must:

1. **Never see full card numbers** — System masks (e.g., "Visa ending in 4242")
2. **Never repeat card info** — Confirm with masked number only
3. **Never transmit card data via email** — Use secure system only
4. **Never store card on computer** — Cards stored in encrypted Stripe vault only

Violation = Immediate incident + retraining required before next shift.

#### GDPR Compliance (EU Customers)

**Data Subject Rights** — Requests must be honored within 30 days:

1. **Right to Access:** Provide all data we hold on customer (with CRM export tool)
2. **Right to Rectification:** Update incorrect info
3. **Right to Erasure:** Delete customer data (right to be forgotten)
4. **Right to Restrict:** Pause processing of data
5. **Data Portability:** Export data in standard format (CSV, JSON)

Escalate all GDPR requests to Legal within 24 hours. Do NOT refuse.

#### CCPA Compliance (California Customers)

Similar to GDPR but different wording. Escalate to Legal. Window: 45 days.

### 11.3 Audit & Escalation Logging

Every escalation must be documented:

```
Escalation Log Entry:
- Ticket ID: [ID]
- Original Agent: [NAME]
- Escalated To: [L2/L3/MANAGER]
- Reason: [SHORT DESCRIPTION]
- Date/Time: [TIMESTAMP]
- Priority: [P1/P2/P3/P4]
- Expected Resolution: [DATE/TIME]
- Status: [OPEN/RESOLVED]
```

---

## Section 12: Appendices

### Appendix A: Email & Chat Response Templates

#### A.1 Order Confirmation Email

```
Subject: CloudVault Subscription Confirmed — Welcome!

Hi [NAME],

Welcome to Typhoon CloudVault! 🎉

Your subscription has been activated:

Plan: [PLAN_NAME] ($[PRICE]/month)
Billing Cycle: Monthly, starting [DATE]
Storage: [STORAGE_GB] GB
Status: Active

Your account is ready to use. You can:
1. Download the desktop app at app.typhooncloudvault.com/download
2. Upload files via the web interface at app.typhooncloudvault.com
3. Invite team members (Professional plan and above)

Next Steps:
- Review security: Enable 2FA (Settings → Security)
- Set up sync: Install desktop app for automatic file syncing
- Need help? Email support@typhooncloudvault.com or chat with us in the app

Thank you for choosing CloudVault!

Best,
Typhoon CloudVault Support
```

#### A.2 Refund Processed Confirmation

```
Subject: Refund Processed — Confirmation #[REF_ID]

Hi [NAME],

Your refund has been processed. Here are the details:

Original Charge: $[AMOUNT]
Refund Amount: $[REFUND]
Refund Date: [DATE]
Expected Receipt: [TIMELINE] (depending on your bank)
Confirmation #: [REF_ID]

Your account access remains active until [END_DATE] at 11:59 PM PT.

If you'd like to rejoin CloudVault in the future, we'll be here! Email
support@typhooncloudvault.com if you have any questions.

Best,
Typhoon CloudVault Support
```

#### A.3 Account Compromise - Immediate Response

```
Subject: URGENT: Account Security Alert — Action Required

Hi [NAME],

We've detected unusual activity on your CloudVault account. For your security,
we've immediately:

✓ Logged you out of all active sessions
✓ Disabled all active API tokens
✓ Frozen permission changes (temporarily)

Next, please:
1. Reset your password: app.typhooncloudvault.com/forgot-password
2. Enable 2FA: Settings → Security → Two-Factor Authentication
3. Review connected apps: Settings → Connected Apps (revoke any unfamiliar)
4. Monitor your accounts: Check other services using the same password

Questions? Reply to this email or call our security team at [PHONE] (Enterprise only).

We take your security seriously.

Typhoon CloudVault Security Team
```

### Appendix B: Error Code Reference

| Code    | Message                      | Cause                          | User Action                     | Support Action             |
| ------- | ---------------------------- | ------------------------------ | ------------------------------- | -------------------------- |
| ERR-001 | "File not found"             | File deleted or access revoked | Check trash; ask folder owner   | N/A                        |
| ERR-002 | "Permission denied"          | No write access to folder      | Ask folder owner for permission | Review permissions         |
| ERR-003 | "Storage quota exceeded"     | Account full                   | Delete files or upgrade         | Process upgrade            |
| ERR-004 | "File too large"             | Exceeds plan limit             | Split file or upgrade           | Confirm plan limits        |
| ERR-005 | "Invalid file name"          | Special characters in name     | Rename without <>":\|?\*        | N/A                        |
| ERR-006 | "Network timeout"            | Upload timed out               | Retry upload; check connection  | Check server status        |
| ERR-007 | "Virus detected"             | Antivirus flagged file         | Contact antivirus vendor        | Escalate if legit file     |
| ERR-008 | "Account locked"             | 5 failed logins                | Wait 15 min or reset password   | Unlock if needed           |
| ERR-009 | "Invalid 2FA code"           | Code expired or wrong          | Re-enter fresh code             | Use backup code if stuck   |
| ERR-010 | "Session expired"            | Too long since login           | Log in again                    | N/A                        |
| ERR-011 | "Payment failed"             | Card declined or expired       | Update payment method           | Check Stripe logs          |
| ERR-012 | "Invalid coupon"             | Code not active or used        | Try different code              | Check promo database       |
| ERR-013 | "Migration in progress"      | Existing import running        | Wait for completion             | Check migration status     |
| ERR-014 | "Sync paused"                | Manual or automatic pause      | Resume in app settings          | Check pause reason         |
| ERR-015 | "Antivirus blocking"         | AV scanning CloudVault         | Add to exclusion list           | Provide AV guide           |
| ERR-016 | "Insufficient disk space"    | <500 MB free space             | Free up disk space              | Check system requirements  |
| ERR-017 | "Database error"             | Local sync cache corrupted     | Delete `.cloudvault-cache`      | Escalate if persists       |
| ERR-018 | "SSO not configured"         | SAML not set up                | Contact admin; enable SSO       | Configure SAML             |
| ERR-019 | "API limit exceeded"         | Too many API calls             | Wait 60 seconds, retry          | Check API key quotas       |
| ERR-020 | "Conflict copy created"      | Simultaneous edits             | Resolve manually                | N/A                        |
| ERR-021 | "Email verification failed"  | Invalid token or expired       | Resend verification link        | Check email logs           |
| ERR-022 | "Two-factor not enabled"     | 2FA required for login         | Enable 2FA first                | Escalate for override      |
| ERR-023 | "Enterprise feature"         | Not available on plan          | Upgrade to Enterprise           | Process upgrade quote      |
| ERR-024 | "Data residency unavailable" | Region not available           | Select different region         | Escalate for custom region |
| ERR-025 | "Rate limited"               | Too many requests              | Wait before retrying            | Check rate limit bucket    |

### Appendix C: Approved Compensation Table (Detailed)

| Scenario                                   | L1 Authority        | L2 Authority                     | L3 Authority                    | Notes                             |
| ------------------------------------------ | ------------------- | -------------------------------- | ------------------------------- | --------------------------------- |
| Incorrect charge (billing error)           | Refund only if <$50 | Refund + $25 credit              | Refund + $50 credit             | Document transaction ID           |
| Late support response (SLA miss)           | $15 credit (if L1)  | $25 credit (if L2)               | $50 credit + review             | Must be within 7 days of incident |
| Service downtime <1 hour                   | $15 credit          | N/A                              | N/A                             | Automatic for >100 users          |
| Service downtime 1-4 hours                 | Not authorized      | $50 credit or partial month free | Full month free                 | Pro-rata calculation              |
| Service downtime >4 hours                  | Not authorized      | Not authorized                   | 1 month free + postmortem       | Formal RCA required               |
| Data loss (unrecoverable)                  | Escalate            | Escalate                         | 1 month free + 1 month discount | If caused by us, not user         |
| Data recovery (successful)                 | Not applicable      | No charge for recovery           | No charge                       | Reassure customer                 |
| Repeated issues (3+ tickets, same problem) | Escalate            | $50 credit                       | 3 months 25% discount           | Retention offer                   |
| Enterprise SLA miss                        | Escalate            | Escalate                         | Per MSA (typically higher)      | Review contract terms             |

### Appendix D: Internal Contact Directory

**Support Team:**

- Tier 1 Team Lead: [NAME], [EMAIL], ext. [X]
- Tier 2 Team Lead: [NAME], [EMAIL], ext. [X]
- Tier 3 Lead: [NAME], [EMAIL], ext. [X]

**Specialized Teams:**

- Billing & Subscriptions: billing-team@typhoon.internal
- Security & Incident Response: security@typhoon.internal
- Legal & Compliance: legal@typhoon.internal
- Migration Services: migrations@typhoon.internal
- Database Recovery: database-recovery@typhoon.internal
- Product Engineering: engineering@typhoon.internal

**Manager Escalation:**

- VP Customer Success: [NAME], [EMAIL], [PHONE]

**After-Hours Emergency (Enterprise Only):**

- On-call Engineer: [PHONE/PAGERDUTY]

**External Contacts:**

- Stripe (Payment Processor): support@stripe.com
- AWS (Hosting): support.aws.amazon.com

### Appendix E: Glossary of Terms

- **2FA:** Two-Factor Authentication; security requiring second verification method (SMS/app)
- **API:** Application Programming Interface; allows external tools to integrate with CloudVault
- **CSAT:** Customer Satisfaction Score; post-ticket satisfaction rating (1-5)
- **Data Residency:** Geographic location where customer's files are stored
- **MSA:** Master Service Agreement; formal contract for Enterprise customers
- **NPS:** Net Promoter Score; measure of customer loyalty/likelihood to recommend
- **OAuth:** Secure authentication method for third-party integrations (Google, Dropbox, etc.)
- **PCI-DSS:** Payment Card Industry Data Security Standard; compliance requirement for credit card handling
- **Proration:** Calculating refund/charge based on partial month used
- **SAML:** Security Assertion Markup Language; enterprise SSO standard
- **SLA:** Service Level Agreement; promise of response and resolution time
- **SSO:** Single Sign-On; enterprise login integration (Okta, Azure AD, Google Workspace)
- **Sync:** Real-time file synchronization between devices and cloud
- **Version History:** Archive of file changes over time (30 days to unlimited depending on plan)

---

**End of Document**

Document Control:

- Version: 4.2
- Last Updated: March 15, 2026
- Approved By: VP Customer Success
- Next Review: June 15, 2026
