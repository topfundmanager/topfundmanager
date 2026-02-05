const apiRequest = async (path, options = {}) => {
  const config = {
    headers: {},
    credentials: 'same-origin',
    ...options,
  };

  if (config.body && !config.headers['Content-Type']) {
    config.headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(path, config);
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : {};

  if (!response.ok || data.success === false) {
    const message = data.error || data.message || 'Request failed';
    throw new Error(message);
  }

  return data;
};

const setAlert = (element, message, type = 'error') => {
  if (!element) return;
  element.textContent = message;
  element.className = `forms-alert ${type}`;
  element.hidden = false;
};

const clearAlert = (element) => {
  if (!element) return;
  element.textContent = '';
  element.hidden = true;
};

const loginForm = document.getElementById('login-form');
const verifyForm = document.getElementById('verify-form');
const resendButton = document.getElementById('resend');
const alertBox = document.getElementById('alert');

let activeEmail = '';
let activeChallenge = '';

if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearAlert(alertBox);

    const emailInput = loginForm.querySelector('input[name="email"]');
    const email = emailInput.value.trim();

    if (!email) {
      setAlert(alertBox, 'Please enter your admin email.');
      return;
    }

    const submitButton = loginForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
      const data = await apiRequest('/api/forms/login', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });

      activeEmail = email;
      activeChallenge = data.challengeId;
      loginForm.hidden = true;
      verifyForm.hidden = false;
      setAlert(alertBox, 'Code sent. Check your email.', 'success');
    } catch (error) {
      setAlert(alertBox, error.message || 'Unable to send code.');
    } finally {
      submitButton.disabled = false;
    }
  });
}

if (verifyForm) {
  verifyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearAlert(alertBox);

    const codeInput = verifyForm.querySelector('input[name="code"]');
    const code = codeInput.value.trim();

    if (!activeEmail || !activeChallenge) {
      setAlert(alertBox, 'Please request a new code.');
      loginForm.hidden = false;
      verifyForm.hidden = true;
      return;
    }

    if (!code) {
      setAlert(alertBox, 'Enter the 6-digit code.');
      return;
    }

    const submitButton = verifyForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
      await apiRequest('/api/forms/verify', {
        method: 'POST',
        body: JSON.stringify({
          email: activeEmail,
          code,
          challengeId: activeChallenge,
        }),
      });

      window.location.href = '/forms/dashboard.html';
    } catch (error) {
      setAlert(alertBox, error.message || 'Verification failed.');
    } finally {
      submitButton.disabled = false;
    }
  });
}

if (resendButton) {
  resendButton.addEventListener('click', async () => {
    if (!activeEmail) {
      setAlert(alertBox, 'Enter your email to send a code.');
      return;
    }

    resendButton.disabled = true;
    clearAlert(alertBox);

    try {
      const data = await apiRequest('/api/forms/login', {
        method: 'POST',
        body: JSON.stringify({ email: activeEmail }),
      });

      activeChallenge = data.challengeId;
      setAlert(alertBox, 'New code sent.', 'success');
    } catch (error) {
      setAlert(alertBox, error.message || 'Unable to resend code.');
    } finally {
      resendButton.disabled = false;
    }
  });
}

const dashboardRoot = document.getElementById('forms-dashboard');

if (dashboardRoot) {
  const adminEmail = document.getElementById('admin-email');
  const submissionsBody = document.getElementById('submissions-body');
  const siteFilter = document.getElementById('site-filter');
  const submissionCount = document.getElementById('submission-count');
  const dashboardAlert = document.getElementById('dashboard-alert');
  const refreshButton = document.getElementById('refresh');
  const logoutButton = document.getElementById('logout');

  const loadSession = async () => {
    const data = await apiRequest('/api/forms/me');
    adminEmail.textContent = data.email;
  };

  const loadSites = async () => {
    const data = await apiRequest('/api/forms/sites');
    const sites = data.sites || [];

    sites.forEach((site) => {
      const option = document.createElement('option');
      option.value = site.site_id;
      option.textContent = site.site_name || site.site_id;
      siteFilter.appendChild(option);
    });
  };

  const formatLabel = (key) => {
    if (!key) return 'Field';
    return key
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const formatValue = (value) => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.map((entry) => String(entry)).join(', ');
    if (typeof value === 'object') {
      return Object.entries(value)
        .map(([key, val]) => `${formatLabel(key)}: ${String(val)}`)
        .join('; ');
    }
    return String(value);
  };

  const buildPreview = (data) => {
    if (!data || typeof data !== 'object') return 'No data';
    const entries = Object.entries(data);
    if (entries.length === 0) return 'No fields';
    return entries
      .slice(0, 3)
      .map(([key, value]) => `${formatLabel(key)}: ${formatValue(value).slice(0, 40)}`)
      .join(' | ');
  };

  const buildDataGrid = (data) => {
    const grid = document.createElement('div');
    grid.className = 'forms-data-grid';

    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
      const row = document.createElement('div');
      row.className = 'forms-data-row';
      const label = document.createElement('div');
      label.className = 'forms-data-label';
      label.textContent = 'Info';
      const value = document.createElement('div');
      value.className = 'forms-data-value';
      value.textContent = 'No form data provided.';
      row.appendChild(label);
      row.appendChild(value);
      grid.appendChild(row);
      return grid;
    }

    Object.entries(data).forEach(([key, value]) => {
      const row = document.createElement('div');
      row.className = 'forms-data-row';
      const label = document.createElement('div');
      label.className = 'forms-data-label';
      label.textContent = formatLabel(key);
      const valueEl = document.createElement('div');
      valueEl.className = 'forms-data-value';
      valueEl.textContent = formatValue(value);
      row.appendChild(label);
      row.appendChild(valueEl);
      grid.appendChild(row);
    });

    return grid;
  };

  const renderSubmissions = (items) => {
    submissionsBody.innerHTML = '';

    if (!items.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.textContent = 'No submissions yet.';
      row.appendChild(cell);
      submissionsBody.appendChild(row);
      submissionCount.textContent = '0 submissions';
      return;
    }

    items.forEach((item) => {
      const row = document.createElement('tr');

      const submittedCell = document.createElement('td');
      submittedCell.textContent = new Date(item.submitted_at).toLocaleString();

      const siteCell = document.createElement('td');
      siteCell.textContent = item.site_id;

      const formCell = document.createElement('td');
      formCell.textContent = item.form_id || '—';

      const originCell = document.createElement('td');
      originCell.textContent = item.origin || '—';

      const previewCell = document.createElement('td');
      const details = document.createElement('details');
      details.className = 'forms-details';
      const summary = document.createElement('summary');
      summary.textContent = buildPreview(item.data);
      const grid = buildDataGrid(item.data);
      details.appendChild(summary);
      details.appendChild(grid);
      previewCell.appendChild(details);

      row.appendChild(submittedCell);
      row.appendChild(siteCell);
      row.appendChild(formCell);
      row.appendChild(originCell);
      row.appendChild(previewCell);

      submissionsBody.appendChild(row);
    });

    submissionCount.textContent = `${items.length} submissions`;
  };

  const loadSubmissions = async () => {
    clearAlert(dashboardAlert);
    submissionCount.textContent = 'Loading';

    const params = new URLSearchParams();
    params.set('limit', '50');
    if (siteFilter.value) {
      params.set('siteId', siteFilter.value);
    }

    const data = await apiRequest(`/api/forms/submissions?${params.toString()}`);
    renderSubmissions(data.submissions || []);
  };

  const initDashboard = async () => {
    try {
      await loadSession();
      await loadSites();
      await loadSubmissions();
    } catch (error) {
      window.location.href = '/forms/index.html';
    }
  };

  siteFilter.addEventListener('change', () => {
    loadSubmissions().catch((error) => setAlert(dashboardAlert, error.message));
  });

  refreshButton.addEventListener('click', () => {
    loadSubmissions().catch((error) => setAlert(dashboardAlert, error.message));
  });

  logoutButton.addEventListener('click', async () => {
    try {
      await apiRequest('/api/forms/logout', { method: 'POST' });
    } catch (error) {
      setAlert(dashboardAlert, error.message || 'Unable to log out.');
    } finally {
      window.location.href = '/forms/index.html';
    }
  });

  initDashboard();
}
