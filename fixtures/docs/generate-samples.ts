/**
 * Generates binary sample documents (DOCX, XLSX, PDF) for seeding MinIO.
 * Run with: bun run fixtures/docs/generate-samples.ts
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as XLSX from 'xlsx';

const OUTPUT_DIR = join(import.meta.dirname, 'samples');

// Fixed date for deterministic output — override Date so all libraries
// (including docx which hardcodes new Date()) produce identical files.
const FIXED_DATE = new Date('2026-01-01T00:00:00Z');
const OriginalDate = globalThis.Date;
globalThis.Date = class extends OriginalDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) {
      super(FIXED_DATE.getTime());
    } else {
      // @ts-expect-error -- forwarding arbitrary args
      super(...args);
    }
  }
} as DateConstructor;
globalThis.Date.now = () => FIXED_DATE.getTime();

async function generateDocx() {
  const doc = new Document({
    creator: 'Typhoon',
    lastModifiedBy: 'Typhoon',
    sections: [
      {
        children: [
          new Paragraph({
            text: 'Typhoon CloudVault — Shipping Information',
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({}),
          new Paragraph({
            text: 'Shipping Methods',
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            children: [
              new TextRun(
                'Typhoon CloudVault offers physical merchandise including branded USB drives, hardware security keys, welcome kits, and branded accessories through our online store. We ship to over 40 countries worldwide.',
              ),
            ],
          }),
          new Paragraph({}),
          new Paragraph({
            children: [
              new TextRun({ text: 'Standard Shipping (5-7 business days): ', bold: true }),
              new TextRun('Free for orders over $50, otherwise $5.99. Available in the United States and Canada.'),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Express Shipping (2-3 business days): ', bold: true }),
              new TextRun('$12.99. Available in the United States and Canada.'),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Overnight Shipping (next business day): ', bold: true }),
              new TextRun(
                '$24.99. Available in the contiguous United States only. Orders placed before 2 PM EST ship same day.',
              ),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'International Shipping (7-14 business days): ', bold: true }),
              new TextRun(
                '$19.99-$39.99 depending on destination. Available in EU, UK, Australia, Japan, and select other countries. Customs fees and import duties are the responsibility of the recipient.',
              ),
            ],
          }),
          new Paragraph({}),
          new Paragraph({
            text: 'Order Tracking',
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            children: [
              new TextRun(
                'All orders include tracking. Once your order ships, you will receive an email with a tracking number and a link to the carrier tracking page. You can also view tracking status in your account under Account Settings, then Orders.',
              ),
            ],
          }),
          new Paragraph({}),
          new Paragraph({
            children: [
              new TextRun(
                'We use the following carriers: USPS for standard domestic, UPS for express and overnight, FedEx for international, and DHL for select international destinations.',
              ),
            ],
          }),
          new Paragraph({}),
          new Paragraph({
            text: 'Lost or Damaged Packages',
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            children: [
              new TextRun(
                'If your package has not arrived within 5 business days after the estimated delivery date, contact support at support@typhooncloudvault.com with your order number. We will investigate with the carrier and either reship the order or issue a full refund.',
              ),
            ],
          }),
          new Paragraph({}),
          new Paragraph({
            children: [
              new TextRun(
                'If your package arrives damaged, take photos of the packaging and the damaged item. Contact support within 7 days of delivery. We will send a replacement at no cost. You do not need to return the damaged item.',
              ),
            ],
          }),
          new Paragraph({}),
          new Paragraph({
            text: 'Delivery Addresses',
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            children: [
              new TextRun(
                'We ship to residential and business addresses. We do not ship to P.O. boxes for express or overnight orders. For international orders, please provide a phone number to assist with customs clearance.',
              ),
            ],
          }),
          new Paragraph({}),
          new Paragraph({
            children: [
              new TextRun(
                'To update your default shipping address, go to Account Settings, then Addresses. You can also enter a different address at checkout. Address changes after an order has shipped are not possible — contact support for assistance.',
              ),
            ],
          }),
          new Paragraph({}),
          new Paragraph({
            text: 'Bulk Orders',
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            children: [
              new TextRun(
                'Enterprise customers ordering 50 or more items qualify for bulk pricing and free express shipping. Contact your account manager or email orders@typhooncloudvault.com for a custom quote. Bulk orders typically ship within 3-5 business days.',
              ),
            ],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const path = join(OUTPUT_DIR, 'shipping-info.docx');
  await writeFile(path, buffer);
  console.log(`  Created ${path}`);
}

async function generateXlsx() {
  const planData = [
    ['Feature', 'Starter', 'Professional', 'Enterprise'],
    ['Monthly Price (per user)', '$9', '$19', '$39'],
    ['Annual Price (per user)', '$86/yr ($7.17/mo)', '$182/yr ($15.17/mo)', '$374/yr ($31.17/mo)'],
    ['Storage per User', '100 GB', '1 TB', 'Unlimited'],
    ['Max File Size', '15 GB', '50 GB', '100 GB'],
    ['Device Sync', '3 devices', 'Unlimited', 'Unlimited'],
    ['Version History', '30 days', '1 year', 'Unlimited'],
    ['Team Folders', 'No', 'Yes', 'Yes'],
    ['Shared Workspaces', 'No', 'Yes', 'Yes'],
    ['Admin Console', 'No', 'Yes (standard)', 'Yes (advanced)'],
    ['Audit Logs', 'No', 'No', 'Yes'],
    ['SSO (SAML/OIDC)', 'No', 'No', 'Yes'],
    ['Custom Data Residency', 'No', 'No', 'Yes'],
    ['Support', 'Email (business hours)', 'Email + Chat (priority)', '24/7 Phone, Email, Chat'],
    ['Dedicated Account Manager', 'No', 'No', 'Yes'],
    ['Free Trial', '14 days', '14 days', '14 days'],
    ['Migration Assistance', 'Self-service', 'Self-service', 'Managed (free for 5TB+)'],
  ];

  const addonData = [
    ['Add-On', 'Price', 'Available On', 'Description'],
    ['Extra Storage (100 GB)', '$3/month', 'Starter, Professional', 'Add 100 GB blocks to any user account'],
    [
      'Advanced Analytics',
      '$5/user/month',
      'Professional',
      'Detailed usage reports, storage trends, user activity dashboards',
    ],
    [
      'Data Loss Prevention (DLP)',
      '$8/user/month',
      'Enterprise',
      'Content scanning, sensitive data detection, sharing restrictions',
    ],
    ['Extended Backup', '$4/user/month', 'All Plans', '90-day backup retention with point-in-time restore'],
    [
      'API Access',
      '$10/month flat',
      'Professional, Enterprise',
      'REST API for file operations, webhook integrations, automation',
    ],
    [
      'White-Label Branding',
      '$200/month flat',
      'Enterprise',
      'Custom logo, colors, domain for the web and desktop apps',
    ],
  ];

  const usageLimits = [
    ['Limit', 'Starter', 'Professional', 'Enterprise'],
    ['API Requests/day', 'N/A', '10,000', '100,000'],
    ['Shared Links/month', '50', '500', 'Unlimited'],
    ['Team Members', '1-5', '5-500', 'Unlimited'],
    ['Webhook Endpoints', 'N/A', '5', '50'],
    ['File Upload Rate', '100 files/hour', '1,000 files/hour', '10,000 files/hour'],
    ['Trash Retention', '30 days', '60 days', '90 days'],
  ];

  const workbook = XLSX.utils.book_new();

  const planSheet = XLSX.utils.aoa_to_sheet(planData);
  planSheet['!cols'] = [{ wch: 28 }, { wch: 22 }, { wch: 25 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(workbook, planSheet, 'Plans');

  const addonSheet = XLSX.utils.aoa_to_sheet(addonData);
  addonSheet['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 25 }, { wch: 55 }];
  XLSX.utils.book_append_sheet(workbook, addonSheet, 'Add-Ons');

  const limitsSheet = XLSX.utils.aoa_to_sheet(usageLimits);
  limitsSheet['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(workbook, limitsSheet, 'Usage Limits');

  const path = join(OUTPUT_DIR, 'pricing-plans.xlsx');
  XLSX.writeFile(workbook, path);
  console.log(`  Created ${path}`);
}

async function generatePdf() {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setProducer('Typhoon');
  pdfDoc.setCreator('Typhoon');
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 60;
  const lineHeight = 16;
  const h2Size = 18;
  const h3Size = 14;
  const bodySize = 10;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  function drawText(text: string, options: { size: number; fontType: typeof font; indent?: number }) {
    const maxWidth = pageWidth - 2 * margin - (options.indent ?? 0);
    const words = text.split(' ');
    let line = '';

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const testWidth = options.fontType.widthOfTextAtSize(testLine, options.size);
      if (testWidth > maxWidth && line) {
        if (y < margin + lineHeight) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin;
        }
        page.drawText(line, {
          x: margin + (options.indent ?? 0),
          y,
          size: options.size,
          font: options.fontType,
          color: rgb(0.1, 0.1, 0.1),
        });
        y -= lineHeight;
        line = word;
      } else {
        line = testLine;
      }
    }

    if (line) {
      if (y < margin + lineHeight) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(line, {
        x: margin + (options.indent ?? 0),
        y,
        size: options.size,
        font: options.fontType,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= lineHeight;
    }
  }

  function heading(text: string) {
    y -= 8;
    drawText(text, { size: h2Size, fontType: boldFont });
    y -= 4;
  }

  function subheading(text: string) {
    y -= 6;
    drawText(text, { size: h3Size, fontType: boldFont });
    y -= 2;
  }

  function body(text: string, indent = 0) {
    drawText(text, { size: bodySize, fontType: font, indent });
  }

  function bullet(text: string) {
    drawText(`• ${text}`, { size: bodySize, fontType: font, indent: 16 });
  }

  function drawTable(headers: string[], rows: string[][], colWidths: number[]) {
    const colX: number[] = [colWidths[0]];
    for (let i = 1; i < colWidths.length; i++) {
      colX.push(colX[i - 1] + colWidths[i - 1]);
    }

    // Header row (bold)
    for (let c = 0; c < headers.length; c++) {
      if (y < margin + lineHeight) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(headers[c], { x: colX[c], y, size: bodySize, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
    }
    y -= lineHeight;

    // Data rows
    for (const row of rows) {
      for (let c = 0; c < row.length; c++) {
        if (y < margin + lineHeight) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin;
        }
        page.drawText(row[c], { x: colX[c], y, size: bodySize, font, color: rgb(0.1, 0.1, 0.1) });
      }
      y -= lineHeight;
    }
  }

  function gap() {
    y -= 8;
  }

  // Title
  page.drawText('Typhoon CloudVault', {
    x: margin,
    y,
    size: 24,
    font: boldFont,
    color: rgb(0.15, 0.3, 0.6),
  });
  y -= 28;
  page.drawText('Getting Started Guide', {
    x: margin,
    y,
    size: 16,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });
  y -= 32;

  heading('1. Create Your Account');
  subheading('Sign Up');
  body(
    'Visit app.typhooncloudvault.com and click "Get Started" to create your account. You can sign up with your email address or use Google/Microsoft SSO. All new accounts begin with a 14-day free trial of the Professional plan — no credit card required.',
  );
  gap();
  subheading('Complete Your Profile');
  body(
    'After signing up, verify your email address by clicking the confirmation link. Then complete your profile by entering your name and organization. If you received an invitation from a team member, clicking the invite link will automatically associate you with their organization.',
  );
  gap();

  heading('2. Install the Desktop App');
  subheading('Download and Install');
  body(
    'Download the CloudVault desktop application from app.typhooncloudvault.com/download. The app is available for Windows 10 and later, macOS 12 and later, and Ubuntu 22.04 and later. Installation takes about two minutes.',
  );
  gap();
  subheading('Sync Folder Locations');
  body(
    'After installation, sign in with your account credentials. The app will create a sync folder on your computer at the following default locations:',
  );
  gap();
  bullet('Windows: C:\\Users\\<your-name>\\CloudVault');
  bullet('macOS: ~/CloudVault');
  bullet('Linux: ~/CloudVault');
  gap();
  body(
    'Any file you place in this folder will automatically sync to the cloud. Files added from other devices or the web interface will appear here as well.',
  );
  gap();

  subheading('System Requirements');
  gap();
  drawTable(
    ['Component', 'Minimum', 'Recommended'],
    [
      ['Operating System', 'Windows 10 / macOS 12', 'Windows 11 / macOS 14'],
      ['RAM', '4 GB', '8 GB'],
      ['Disk Space', '500 MB', '1 GB'],
      ['Internet', '5 Mbps', '25 Mbps'],
    ],
    [margin, 170, 170],
  );
  gap();

  heading('3. Upload Your First Files');
  subheading('Upload Methods');
  body('You can add files to CloudVault in three ways:');
  gap();
  bullet('Drag and drop: Move files into your CloudVault sync folder or drag them into the web interface.');
  bullet('File browser: Click "Upload" in the web interface to select files from your computer.');
  bullet('Mobile app: Use the iOS or Android app to upload photos, videos, and documents directly from your device.');
  gap();
  subheading('Supported Formats');
  body(
    'CloudVault supports all file types. There are no format restrictions. Upload speeds depend on your internet connection — the app shows progress for each file in the sync status panel.',
  );
  gap();

  heading('4. Organize with Folders');
  body(
    'Create folders to organize your files. Right-click in the sync folder or web interface and select "New Folder." Folders sync across all your devices automatically.',
  );
  gap();
  subheading('Naming Conventions');
  body(
    'Tip: Use a consistent naming convention for your folders. We recommend organizing by project or department rather than by date. For example: "Marketing/Campaign-Q1-2026" is easier to navigate than "2026/01/Marketing".',
  );
  gap();

  heading('5. Share Files and Collaborate');
  subheading('Share Links');
  body(
    'Right-click any file or folder and select "Share" to generate a share link. You can set permissions to view-only or edit access, add password protection, set expiration dates, or restrict sharing to your organization.',
  );
  gap();
  subheading('Team Folders');
  body(
    'On Professional and Enterprise plans, you can create Team Folders — shared spaces where multiple team members collaborate. Team folders appear under a dedicated "Teams" section in your sync folder. Changes made by any team member sync in real time.',
  );
  gap();

  heading('6. Enable Security Features');
  subheading('Two-Factor Authentication');
  body(
    'We strongly recommend enabling two-factor authentication (2FA) immediately after creating your account. Go to Account Settings, then Security, and click "Enable Two-Factor Authentication." CloudVault supports authenticator apps (Google Authenticator, Authy), SMS codes, and hardware security keys.',
  );
  gap();
  subheading('Single Sign-On');
  body(
    "Enterprise administrators should also configure SSO via SAML 2.0 or OIDC from the Admin Console. This ensures all team members authenticate through your organization's identity provider.",
  );
  gap();

  heading('7. Set Up Mobile Backup');
  subheading('Camera Backup');
  body(
    'Install the CloudVault mobile app from the App Store (iOS) or Google Play (Android). Sign in and enable automatic photo and video backup under Settings, then Camera Backup. New photos and videos will upload automatically when you are connected to Wi-Fi.',
  );
  gap();
  subheading('Document Scanning');
  body(
    'You can also enable document scanning — open the app, tap the camera icon, and scan receipts, whiteboards, or paper documents. Scanned files are saved as searchable PDFs with OCR.',
  );
  gap();

  heading('8. Next Steps');
  body('Once you are set up, explore these additional features:');
  gap();
  bullet('Version History: Browse and restore previous versions of any file from the web interface.');
  bullet('Offline Access: Mark files or folders as "Available Offline" to access them without an internet connection.');
  bullet('Integrations: Connect CloudVault to Slack, Google Workspace, or Microsoft 365 from the Integrations page.');
  bullet('Admin Console: Organization admins can manage users, view analytics, and enforce policies.');
  gap();
  body('For questions or help, visit our Help Center at help.typhooncloudvault.com or email support@typhooncloudvault.com.');

  const pdfBytes = await pdfDoc.save();
  const path = join(OUTPUT_DIR, 'getting-started.pdf');
  await writeFile(path, pdfBytes);
  console.log(`  Created ${path}`);
}

console.log('Generating binary fixtures...');
await Promise.all([generateDocx(), generateXlsx(), generatePdf()]);
console.log('Done.');
