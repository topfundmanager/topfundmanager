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
      // Return success to not alert the bot, but don't process
      return new Response(
        JSON.stringify({ success: true, message: 'Application submitted successfully' }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // 2. Timing check - if submitted too fast (< 3 seconds), likely a bot
    if (formData._timestamp) {
      const submissionTime = Date.now() - parseInt(formData._timestamp, 10);
      if (submissionTime < 3000) {
        console.log('Form submitted too quickly - rejecting');
        return new Response(
          JSON.stringify({ success: true, message: 'Application submitted successfully' }),
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
    const requiredFields = ['firstName', 'lastName', 'email', 'phone'];
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

    // Validate input lengths (prevent excessively long inputs)
    const maxLengths = {
      firstName: 50,
      lastName: 50,
      email: 100,
      phone: 20,
      howFound: 500,
      occupation: 100,
      cityState: 100,
      goals: 2000,
      areasNeedHelp: 2000,
      mainObstacle: 2000,
      whySelected: 2000,
    };

    for (const [field, maxLength] of Object.entries(maxLengths)) {
      if (trimmedData[field] && trimmedData[field].length > maxLength) {
        return new Response(
          JSON.stringify({ success: false, error: `${field} exceeds maximum length of ${maxLength} characters` }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }
    }

    // Check for suspicious patterns (common spam indicators)
    const spamPatterns = [
      /\[url=/i,           // BBCode links
      /<a\s+href/i,        // HTML links
      /https?:\/\/.*https?:\/\//i,  // Multiple URLs
      /viagra|cialis|casino|lottery|winner|congratulations.*won/i,  // Common spam words
    ];

    const textFields = ['goals', 'areasNeedHelp', 'mainObstacle', 'whySelected', 'howFound'];
    for (const field of textFields) {
      if (trimmedData[field]) {
        for (const pattern of spamPatterns) {
          if (pattern.test(trimmedData[field])) {
            console.log(`Spam pattern detected in ${field}`);
            return new Response(
              JSON.stringify({ success: true, message: 'Application submitted successfully' }),
              { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
            );
          }
        }
      }
    }

    // === PROCESS VALID SUBMISSION ===

    // Build email content
    const emailContent = buildEmailContent(trimmedData);

    // Send email via Resend
    const fromEmail = env.FROM_EMAIL || 'noreply@updates.topfundmanager.com';
    const toEmail = env.TO_EMAIL || 'crafted@marloweemrys.com';
    const subject = `VIP 1-on-1 Experience Application: ${trimmedData.firstName} ${trimmedData.lastName}`;

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
