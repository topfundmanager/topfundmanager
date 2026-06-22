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

    // === SPAM PREVENTION CHECKS ===

    // 1. Honeypot field - if filled, it's a bot
    if (formData.website || formData.url || formData.company_url) {
      console.log('Honeypot triggered - rejecting submission');
      return new Response(
        JSON.stringify({ success: true, message: 'Submission received' }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // 2. Timing check - if submitted too fast (< 3 seconds), likely a bot
    if (formData._timestamp) {
      const submissionTime = Date.now() - parseInt(formData._timestamp, 10);
      if (submissionTime < 3000) {
        console.log('Form submitted too quickly - rejecting');
        return new Response(
          JSON.stringify({ success: true, message: 'Submission received' }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }
    }

    // === INPUT VALIDATION ===

    // Trim all string inputs
    const trimmedData = {};
    for (const [key, value] of Object.entries(formData)) {
      trimmedData[key] = typeof value === 'string' ? value.trim() : value;
    }

    // Validate required fields
    const requiredFields = ['streetAddress', 'city', 'state', 'zip', 'firstName', 'lastName', 'email', 'phone'];
    for (const field of requiredFields) {
      if (!trimmedData[field]) {
        return new Response(
          JSON.stringify({ success: false, error: `Missing required field: ${field}` }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedData.email)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Please enter a valid email address' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Validate name format (letters, spaces, hyphens, apostrophes only)
    const nameRegex = /^[a-zA-Z\s'-]+$/;
    if (!nameRegex.test(trimmedData.firstName) || !nameRegex.test(trimmedData.lastName)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Name can only contain letters, spaces, hyphens, and apostrophes' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Validate phone format (digits, spaces, dashes, parentheses, plus sign)
    const phoneRegex = /^[\d\s\-\(\)\+]+$/;
    if (!phoneRegex.test(trimmedData.phone)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Please enter a valid phone number' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Validate input lengths
    const maxLengths = {
      streetAddress: 200,
      addressLine2: 200,
      city: 100,
      state: 100,
      zip: 20,
      firstName: 50,
      lastName: 50,
      email: 100,
      phone: 20,
      hvacAge: 100,
      roofAge: 100,
    };

    for (const [field, maxLength] of Object.entries(maxLengths)) {
      if (trimmedData[field] && trimmedData[field].length > maxLength) {
        return new Response(
          JSON.stringify({ success: false, error: `${field} exceeds maximum length of ${maxLength} characters` }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }
    }

    // === PROCESS VALID SUBMISSION ===

    // Build email content
    const emailContent = buildEmailContent(trimmedData);

    // Store in Supabase (non-blocking)
    try {
      await insertSupabaseSubmission(env, request, trimmedData);
    } catch (supabaseError) {
      console.error('Supabase insert error:', supabaseError);
    }

    // Send email via Resend
    const fromEmail = env.FROM_EMAIL || 'noreply@updates.topfundmanager.com';
    const toEmail = env.TO_EMAIL || 'crafted@marloweemrys.com';
    const address = `${trimmedData.streetAddress}, ${trimmedData.city}, ${trimmedData.state} ${trimmedData.zip}`;
    const subject = `Cash Offer Request: ${address}`;

    try {
      await sendResendEmail(env, fromEmail, toEmail, subject, emailContent, trimmedData.email);
    } catch (emailError) {
      console.error('Resend API error:', emailError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to send email' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Submission received successfully' }),
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
 * Send email via Resend API
 */
async function sendResendEmail(env, fromEmail, toEmail, subject, htmlContent, replyTo) {
  const resendApiKey = env.RESEND_API_KEY;

  if (!resendApiKey) {
    throw new Error('Resend API key not configured');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: toEmail,
      subject: subject,
      html: htmlContent,
      reply_to: replyTo,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Resend API error: ${error}`);
  }

  return response.json();
}

function buildEmailContent(data) {
  return `
    <h2>New Cash Offer Request</h2>

    <h3>Property Address</h3>
    <table style="border-collapse: collapse; width: 100%;">
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Street Address:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.streetAddress)}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Address Line 2:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.addressLine2 || 'N/A')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>City:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.city)}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>State:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.state)}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>ZIP:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.zip)}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Country:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.country || 'United States')}</td></tr>
    </table>

    <h3>Contact & General Information</h3>
    <table style="border-collapse: collapse; width: 100%;">
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Name:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.firstName)} ${escapeHtml(data.lastName)}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Email:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.email)}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Phone:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.phone)}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Bedrooms:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.bedrooms || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Square Footage:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.squareFootage || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Property Type:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.propertyType || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>HOA Type:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.hoaType || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Annual HOA Fee:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.annualHoaFee || 'Not provided')}</td></tr>
    </table>

    <h3>Structural Information</h3>
    <table style="border-collapse: collapse; width: 100%;">
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>HVAC Units:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.hvacUnits || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>HVAC Age:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.hvacAge || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Roof Age:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.roofAge || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Foundation Type:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.foundationType || 'Not provided')}</td></tr>
    </table>

    <h3>Basement Details</h3>
    <table style="border-collapse: collapse; width: 100%;">
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Finished Basement:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.finishedBasement || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>HVAC in Basement:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.hvacInBasement || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Basement Bedrooms:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.basementBedrooms || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Basement Bathrooms:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.basementBathrooms || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Basement Flooring:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.basementFlooring || 'Not provided')}</td></tr>
    </table>

    <h3>Kitchen Details</h3>
    <table style="border-collapse: collapse; width: 100%;">
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Countertops:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.kitchenCountertops || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Appliances:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.kitchenAppliances || 'Not provided')}</td></tr>
    </table>

    <h3>Exterior Information</h3>
    <table style="border-collapse: collapse; width: 100%;">
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Pool:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.hasPool || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Pool Type:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.poolType || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Looking for next home:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.lookingForNextHome || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Currently listed:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.currentlyListed || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Waste handling:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.wasteHandling || 'Not provided')}</td></tr>
      <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Water supply:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${escapeHtml(data.waterSupply || 'Not provided')}</td></tr>
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

async function insertSupabaseSubmission(env, request, data) {
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return;
  }

  const baseUrl = supabaseUrl.endsWith('/') ? supabaseUrl.slice(0, -1) : supabaseUrl;
  const origin = request.headers.get('origin') || '';
  const referrer = request.headers.get('referer') || '';
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
  const userAgent = request.headers.get('user-agent') || '';

  await fetch(`${baseUrl}/rest/v1/forms_submissions`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      site_id: 'topfundmanager',
      form_id: 'cash-offer',
      data,
      origin,
      ip,
      user_agent: userAgent,
      page_url: referrer,
      referrer,
    }),
  });
}
