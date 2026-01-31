export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const formData = await request.json();

    // Validate required fields
    const requiredFields = ['firstName', 'lastName', 'email', 'phone'];
    for (const field of requiredFields) {
      if (!formData[field]) {
        return new Response(
          JSON.stringify({ success: false, error: `Missing required field: ${field}` }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }
    }

    // Build email content
    const emailContent = buildEmailContent(formData);

    // Send email via Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL || 'noreply@topfundmanager.com',
        to: env.TO_EMAIL || 'contact@topfundmanager.com',
        subject: `VIP 1-on-1 Experience Application: ${formData.firstName} ${formData.lastName}`,
        html: emailContent,
        reply_to: formData.email,
      }),
    });

    if (!resendResponse.ok) {
      const errorData = await resendResponse.text();
      console.error('Resend API error:', errorData);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to send email' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Store in Google Sheets (non-blocking - don't fail if this errors)
    try {
      if (env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY && env.GOOGLE_SPREADSHEET_ID) {
        await appendToGoogleSheet(env, formData);
      }
    } catch (sheetError) {
      console.error('Google Sheets error (non-fatal):', sheetError);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Application submitted successfully' }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );

  } catch (error) {
    console.error('Error processing form:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

/**
 * Append form data to Google Sheets
 */
async function appendToGoogleSheet(env, formData) {
  const accessToken = await getGoogleAccessToken(env);

  const spreadsheetId = env.GOOGLE_SPREADSHEET_ID;
  const sheetName = env.GOOGLE_SHEET_NAME || 'Sheet1';

  // Prepare row data with timestamp
  const timestamp = new Date().toISOString();
  const rowData = [
    timestamp,
    formData.firstName || '',
    formData.lastName || '',
    formData.email || '',
    formData.phone || '',
    formData.howFound || '',
    formData.previousApplication || '',
    formData.occupation || '',
    formData.cityState || '',
    formData.goals || '',
    formData.areasNeedHelp || '',
    formData.experienceLevel || '',
    formData.currentRealEstate || '',
    formData.rentalUnitsGoal || '',
    formData.currentIncome || '',
    formData.targetIncome || '',
    formData.mainObstacle || '',
    formData.whySelected || '',
    formData.investmentBudget || '',
    formData.alternativeOption || '',
    formData.creditScore || '',
  ];

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!A:U:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [rowData],
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Sheets API error: ${error}`);
  }

  return response.json();
}

/**
 * Get Google OAuth2 access token using service account credentials
 */
async function getGoogleAccessToken(env) {
  const serviceAccountEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  // The private key comes with escaped newlines, need to convert them
  const privateKey = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');

  // Create JWT header
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  // Create JWT claims
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: serviceAccountEmail,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600, // 1 hour
  };

  // Encode header and claims
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaims = base64UrlEncode(JSON.stringify(claims));
  const signatureInput = `${encodedHeader}.${encodedClaims}`;

  // Sign with RSA-SHA256
  const signature = await signRS256(signatureInput, privateKey);
  const jwt = `${signatureInput}.${signature}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

/**
 * Base64 URL encode a string
 */
function base64UrlEncode(str) {
  const base64 = btoa(str);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Sign data with RS256 using Web Crypto API
 */
async function signRS256(data, privateKeyPem) {
  // Parse PEM key
  const pemContents = privateKeyPem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  // Import the key
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  // Sign the data
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const signatureBuffer = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, dataBuffer);

  // Convert to base64url
  const signatureArray = new Uint8Array(signatureBuffer);
  const base64 = btoa(String.fromCharCode(...signatureArray));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildEmailContent(data) {
  return `
    <h2>New VIP 1-on-1 Experience Application</h2>

    <h3>Contact Information</h3>
    <table style="border-collapse: collapse; width: 100%;">
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Name:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.firstName)} ${escapeHtml(data.lastName)}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Email:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.email)}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Phone:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.phone)}</td></tr>
    </table>

    <h3>Background</h3>
    <table style="border-collapse: collapse; width: 100%;">
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>How did you find out about Justin?</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.howFound || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Previous application?</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.previousApplication || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Current occupation:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.occupation || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>City/State:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.cityState || 'Not provided')}</td></tr>
    </table>

    <h3>Real Estate Experience</h3>
    <table style="border-collapse: collapse; width: 100%;">
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Goals:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.goals || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Areas need help with:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.areasNeedHelp || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Experience level:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.experienceLevel || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Current real estate owned:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.currentRealEstate || 'Not provided')}</td></tr>
    </table>

    <h3>Financial Goals</h3>
    <table style="border-collapse: collapse; width: 100%;">
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Rental units goal this year:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.rentalUnitsGoal || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Current monthly income:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.currentIncome || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Target monthly income:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.targetIncome || 'Not provided')}</td></tr>
    </table>

    <h3>Commitment</h3>
    <table style="border-collapse: collapse; width: 100%;">
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Main obstacle:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.mainObstacle || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Why should you be selected?</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.whySelected || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Investment budget:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.investmentBudget || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Alternative option:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.alternativeOption || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Credit score range:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.creditScore || 'Not provided')}</td></tr>
    </table>
  `;
}

function escapeHtml(text) {
  if (!text) return '';
  const str = String(text);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
