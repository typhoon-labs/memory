# Typhoon CloudVault — Troubleshooting Guide

## Files Not Syncing

If files are not syncing between your device and CloudVault:

1. **Check your internet connection** — CloudVault requires an active internet connection to sync. Try opening a webpage to verify connectivity.
2. **Verify the sync folder** — ensure the file is inside your CloudVault sync folder (default: `~/CloudVault` on Mac/Linux, `C:\Users\<name>\CloudVault` on Windows).
3. **Check file size limits** — files exceeding your plan's size limit (15 GB Starter, 50 GB Professional, 100 GB Enterprise) will not sync. A warning icon appears next to oversized files.
4. **Restart the desktop app** — right-click the CloudVault icon in your system tray and select **Restart**.
5. **Check for conflicting files** — if two devices modify the same file simultaneously, CloudVault creates a conflict copy named `<filename> (conflict <date>).<ext>`. Resolve conflicts by keeping the correct version and deleting the duplicate.

If the issue persists, open the desktop app, go to **Settings → Diagnostics**, and click **Generate Support Bundle**. Send this bundle to support@typhooncloudvault.com.

## Upload Failures

Common causes of upload failures:

- **Error UV-1001: File too large** — the file exceeds your plan's size limit. Upgrade your plan or split the file.
- **Error UV-1002: Storage quota exceeded** — you have reached your storage limit. Delete unused files or upgrade your plan.
- **Error UV-1003: Invalid filename** — the filename contains characters not supported on all platforms. Rename the file to remove special characters like `< > : " | ? *`.
- **Error UV-1004: Network timeout** — the upload timed out due to a slow or interrupted connection. CloudVault automatically retries failed uploads. If the error persists, try uploading from a different network.
- **Error UV-1005: Permission denied** — you do not have write access to the target folder. Contact the folder owner or your organization admin.

## Slow Performance

If CloudVault feels slow:

- **Large initial sync** — the first sync after installation may take time depending on the amount of data. Check progress in the desktop app under **Settings → Sync Status**.
- **Too many files** — folders with more than 100,000 files may experience slower indexing. Consider archiving old files into ZIP archives.
- **Antivirus interference** — some antivirus software scans every file CloudVault syncs, causing delays. Add the CloudVault sync folder and application to your antivirus exclusion list.
- **VPN routing** — if you use a VPN, ensure it is not routing traffic through a distant region. Connect to a VPN server close to your CloudVault data region for best performance.
- **Bandwidth throttling** — CloudVault limits upload bandwidth to 80% of your connection speed by default. Adjust this in **Settings → Network → Bandwidth Limit**.

## Browser Compatibility

The CloudVault web interface supports the following browsers:

| Browser         | Minimum Version |
| --------------- | --------------- |
| Google Chrome   | 120+            |
| Mozilla Firefox | 121+            |
| Microsoft Edge  | 120+            |
| Safari          | 17+             |
| Brave           | 1.60+           |

Internet Explorer is not supported. If you experience issues on a supported browser, clear your browser cache and cookies, then try again.

## Cannot Sign In

If you cannot sign in to your account:

1. **Verify your email** — make sure you are using the correct email address. Check for typos.
2. **Reset your password** — click "Forgot password?" and follow the instructions.
3. **Check 2FA** — if you have two-factor authentication enabled, ensure your authenticator app is showing the correct code. Codes refresh every 30 seconds.
4. **Account locked** — after 5 failed login attempts, your account is locked for 15 minutes. Wait and try again, or contact support.
5. **SSO issues** — if your organization uses SSO, contact your IT admin. Common issues include expired SSO sessions and misconfigured identity providers.

## Desktop App Crashes

If the CloudVault desktop app crashes repeatedly:

1. Update to the latest version from app.typhooncloudvault.com/download
2. Clear the local cache: delete the `.cloudvault-cache` folder in your home directory
3. Check system requirements: 4 GB RAM minimum, 500 MB free disk space for the app
4. Review crash logs at `~/.cloudvault/logs/` (Mac/Linux) or `%APPDATA%\CloudVault\logs\` (Windows)

If crashes continue after these steps, uninstall and reinstall the application. Your synced files will not be affected — they remain in your cloud storage.

## Contact Support

If none of the above resolves your issue:

- **Email:** support@typhooncloudvault.com
- **In-app chat:** click the help icon in the bottom-right corner of the web or desktop app
- **Phone:** +1-888-555-TYPHOON (Enterprise plans only, 24/7)

Include your account email, a description of the issue, and any error codes or screenshots when contacting support.
