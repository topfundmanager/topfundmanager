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

    // Send email via Mailgun
    const fromEmail = env.FROM_EMAIL || 'noreply@mail.topfundmanager.com';
    const toEmail = env.TO_EMAIL || 'crafted@marloweemrys.com';
    const subject = `VIP 1-on-1 Experience Application: ${formData.firstName} ${formData.lastName}`;

    try {
      await sendMailgunEmail(env, fromEmail, toEmail, subject, emailContent, formData.email);
    } catch (emailError) {
      console.error('Mailgun API error:', emailError);
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
 * Send email via Mailgun API
 */
async function sendMailgunEmail(env, fromEmail, toEmail, subject, htmlContent, replyTo) {
  const mailgunApiKey = env.MAILGUN_API_KEY;
  const mailgunDomain = env.MAILGUN_DOMAIN;

  if (!mailgunApiKey || !mailgunDomain) {
    throw new Error('Mailgun credentials not configured');
  }

  const formData = new FormData();
  formData.append('from', fromEmail);
  formData.append('to', toEmail);
  formData.append('subject', subject);
  formData.append('html', htmlContent);
  formData.append('h:Reply-To', replyTo);

  const response = await fetch(
    `https://api.mailgun.net/v3/${mailgunDomain}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`api:${mailgunApiKey}`)}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Mailgun API error: ${error}`);
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
