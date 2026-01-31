# Deploying Top Fund Manager to Cloudflare Pages

This guide explains how to deploy the static site to Cloudflare Pages with Resend for email notifications and Google Sheets for storing form submissions.

## Prerequisites

1. A Cloudflare account
2. A Resend account (https://resend.com)
3. A Google Cloud account (for Sheets integration)
4. Node.js installed locally (for testing)
5. Wrangler CLI: `npm install -g wrangler`

## Project Structure

```
topfundmanager/
├── index.html              # Main homepage
├── 1-on-1-experience.html  # VIP application page
├── functions/              # Cloudflare Pages Functions
│   └── api/
│       └── contact.js      # Form submission handler
├── assets/                 # All static assets
│   ├── css/
│   │   └── form.css        # Form styles
│   ├── js/
│   │   ├── form.js         # Form submission JavaScript
│   │   └── lib/            # JavaScript libraries (jQuery, etc.)
│   ├── images/             # Uploaded images
│   ├── theme/              # Theme CSS and JS
│   └── vendor/             # Third-party plugins (JS/CSS)
├── wrangler.toml           # Cloudflare configuration
└── package.json            # Node.js dependencies
```

## Setup Steps

### 1. Get Your Resend API Key

1. Sign up at https://resend.com
2. Go to API Keys section
3. Create a new API key
4. Copy the key (starts with `re_`)

### 2. Configure DNS (if using custom domain)

If you want to use `topfundmanager.com`:
1. In Cloudflare Dashboard > DNS
2. Point your domain to Cloudflare Pages

### 3. Deploy to Cloudflare Pages

#### Option A: Using Wrangler CLI

```bash
# Login to Cloudflare
wrangler login

# Deploy
npm run deploy
```

#### Option B: Using Cloudflare Dashboard

1. Go to Cloudflare Dashboard > Pages
2. Click "Create a project"
3. Select "Upload assets" or connect your Git repository
4. Upload the entire project folder
5. Set build output directory: `.` (root)

### 4. Configure Environment Variables

In Cloudflare Dashboard > Pages > Your Project > Settings > Environment variables:

| Variable | Value | Description |
|----------|-------|-------------|
| `RESEND_API_KEY` | `re_xxxxx...` | Your Resend API key |
| `FROM_EMAIL` | `noreply@topfundmanager.com` | Sender email (must be verified in Resend) |
| `TO_EMAIL` | `contact@topfundmanager.com` | Where form submissions are sent |

**Important:** For `FROM_EMAIL`, you need to either:
- Verify your domain in Resend (recommended), or
- Use `onboarding@resend.dev` for testing

### 5. Verify Domain in Resend (Recommended)

1. Go to Resend Dashboard > Domains
2. Add `topfundmanager.com`
3. Add the DNS records shown to your Cloudflare DNS
4. Wait for verification (usually a few minutes)

### 6. Set Up Google Sheets Integration

#### Step 1: Create a Google Cloud Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google Sheets API**:
   - Go to APIs & Services > Library
   - Search for "Google Sheets API"
   - Click Enable

4. Create a Service Account:
   - Go to APIs & Services > Credentials
   - Click "Create Credentials" > "Service Account"
   - Give it a name (e.g., "topfundmanager-sheets")
   - Click "Create and Continue"
   - Skip the optional steps and click "Done"

5. Create a Key for the Service Account:
   - Click on the service account you just created
   - Go to the "Keys" tab
   - Click "Add Key" > "Create new key"
   - Select "JSON" and click "Create"
   - Save the downloaded JSON file securely

#### Step 2: Create and Share the Spreadsheet

1. Create a new Google Spreadsheet
2. Add headers in Row 1:
   ```
   Timestamp | First Name | Last Name | Email | Phone | How Found | Previous Application | Occupation | City/State | Goals | Areas Need Help | Experience Level | Current Real Estate | Rental Units Goal | Current Income | Target Income | Main Obstacle | Why Selected | Investment Budget | Alternative Option | Credit Score
   ```
3. Copy the Spreadsheet ID from the URL:
   - URL format: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`
4. Share the spreadsheet with the service account email:
   - Click "Share"
   - Add the service account email (from the JSON file, field `client_email`)
   - Give it "Editor" access

#### Step 3: Add Environment Variables

Add these to Cloudflare Pages environment variables:

| Variable | Value | Description |
|----------|-------|-------------|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `xxx@xxx.iam.gserviceaccount.com` | Service account email from JSON |
| `GOOGLE_PRIVATE_KEY` | `-----BEGIN PRIVATE KEY-----\n...` | Private key from JSON (keep the `\n` escapes) |
| `GOOGLE_SPREADSHEET_ID` | `1abc123...` | Spreadsheet ID from URL |
| `GOOGLE_SHEET_NAME` | `Sheet1` | (Optional) Sheet name, defaults to "Sheet1" |

**Important:** When copying the private key:
- Copy the entire `private_key` value from the JSON file
- Include the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`
- Keep the `\n` characters as-is (don't convert to actual newlines)

## Local Development

```bash
# Install dependencies
npm install

# Run local development server
npm run dev
```

This starts a local server at `http://localhost:8788` with live reload.

## Testing the Form

1. Navigate to `/1-on-1-experience.html`
2. Fill out the multi-step form
3. Submit and check:
   - Email is received (check Resend dashboard)
   - New row appears in Google Sheets

## Troubleshooting

### Form not submitting
- Check browser console for errors
- Verify the `/api/contact` endpoint is accessible
- Check Cloudflare Pages Functions logs

### Email not received
- Check Resend dashboard for errors
- Verify domain/email is configured in Resend
- Check spam folder
- Ensure environment variables are set correctly

### CORS errors
- The function includes CORS headers for all origins
- If needed, modify `corsHeaders` in `functions/api/contact.js`

### Google Sheets not updating
- Verify the spreadsheet is shared with the service account email
- Check that the Sheets API is enabled in Google Cloud Console
- Verify the private key is copied correctly (with `\n` escapes)
- Check Cloudflare Pages Functions logs for errors
- Note: Sheets errors are non-blocking; emails will still send

## Files Modified from WordPress Export

The following files were created/modified to convert from WordPress to static:

1. **functions/api/contact.js** - New Cloudflare Pages Function for form handling
2. **assets/js/form.js** - New form submission JavaScript
3. **assets/css/form.css** - New form styles
4. **1-on-1-experience.html** - Added new static form, CSS and JS references
5. **wrangler.toml** - Cloudflare configuration
6. **package.json** - Node.js project configuration

## Security Notes

- Never commit API keys to version control
- Always use environment variables for sensitive data
- The form includes input validation and XSS protection
- Consider adding rate limiting in production
