# Typhoon CloudVault — Account Management Guide

## Creating an Account

1. Visit app.typhooncloudvault.com and click **Get Started**
2. Enter your work email address and choose a password (minimum 12 characters, must include uppercase, lowercase, and a number)
3. Verify your email by clicking the confirmation link sent to your inbox
4. Choose your plan or start a 14-day free trial
5. Complete your profile by adding your name and organization

If your organization already has a CloudVault account, ask your admin to send you an invitation. Invited users skip the plan selection step and are automatically added to the organization.

## Signing In

CloudVault supports multiple sign-in methods:

- **Email and password** — standard login at app.typhooncloudvault.com
- **Google SSO** — sign in with your Google Workspace account
- **Microsoft SSO** — sign in with your Microsoft 365 account
- **SAML/OIDC SSO** — available on Enterprise plans, configured by your IT admin

## Password Reset

If you forget your password:

1. Click **Forgot password?** on the sign-in page
2. Enter the email address associated with your account
3. Check your inbox for a reset link (valid for 1 hour)
4. Click the link and choose a new password

If you do not receive the reset email within 5 minutes, check your spam folder. If the issue persists, contact support@typhooncloudvault.com.

## Two-Factor Authentication (2FA)

We strongly recommend enabling 2FA for all accounts. CloudVault supports:

- **Authenticator app** (Google Authenticator, Authy, 1Password) — recommended
- **SMS codes** — sent to your registered phone number
- **Hardware security keys** (YubiKey, Titan) — available on Professional and Enterprise plans

To enable 2FA:

1. Go to **Account Settings → Security**
2. Click **Enable Two-Factor Authentication**
3. Choose your preferred method and follow the setup instructions
4. Save the backup recovery codes in a secure location

Enterprise admins can enforce 2FA for all users in the organization from the Admin Console.

## Changing Your Email Address

1. Go to **Account Settings → Profile**
2. Click **Change Email**
3. Enter your new email address and your current password
4. Verify the new email by clicking the confirmation link

Note: If your organization uses SSO, your email is managed by your identity provider. Contact your IT admin to update it.

## Managing Team Members (Admin)

Organization admins can manage team members from the Admin Console:

- **Invite users** — send email invitations with a specific role (Member, Editor, Admin)
- **Remove users** — revoke access immediately; their files are transferred to the admin
- **Change roles** — promote or demote users between Member, Editor, and Admin roles
- **View activity** — see login history, file access logs, and device information

## Data Export

You can export all your data at any time:

1. Go to **Account Settings → Data & Privacy**
2. Click **Export My Data**
3. Choose the format: ZIP archive (files + metadata) or JSON (metadata only)
4. CloudVault will prepare the export and email you a download link within 24 hours

Exports include all files, folder structure, sharing settings, and account metadata.

## Deleting Your Account

Account deletion is permanent and cannot be undone. Before deleting:

- Download any files you want to keep using the Data Export feature
- Cancel your subscription to avoid further charges
- Transfer ownership of shared folders to another team member

To delete your account:

1. Go to **Account Settings → Data & Privacy**
2. Click **Delete Account**
3. Enter your password and type "DELETE" to confirm
4. Your account and all associated data will be permanently removed within 72 hours

If you are the sole admin of an organization, you must either transfer the admin role to another user or delete the organization first.
