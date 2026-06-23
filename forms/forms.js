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
  let activeModal = null;

  const loadSession = async () => {
    const data = await apiRequest('/api/forms/me');
    adminEmail.textContent = data.email;
  };

  const getSiteDisplayName = (siteId, siteName) => {
    if (siteId === 'theregurus' || siteName === 'The RE Gurus') {
      return 'The Regurus';
    }

    return siteName || siteId || '—';
  };

  const loadSites = async () => {
    const data = await apiRequest('/api/forms/sites');
    const sites = data.sites || [];

    sites.forEach((site) => {
      const option = document.createElement('option');
      option.value = site.site_id;
      option.textContent = getSiteDisplayName(site.site_id, site.site_name);
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

  const formatTimestamp = (value) => {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString();
  };

  const getImportMeta = (item) => {
    const data = item?.data;
    const imported = data && typeof data === 'object' && !Array.isArray(data) ? data._import : null;
    return imported && typeof imported === 'object' && !Array.isArray(imported) ? imported : {};
  };

  const getSubmissionFields = (item) => {
    const data = item?.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};

    return Object.fromEntries(
      Object.entries(data).filter(([key]) => key !== '_import')
    );
  };

  const buildPreview = (data) => {
    if (!data || typeof data !== 'object') return 'No data';
    const entries = Object.entries(data).filter(([key]) => key !== '_import');
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

  const appendMetaCard = (parent, label, value) => {
    const card = document.createElement('div');
    card.className = 'forms-modal-card';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    const valueEl = document.createElement('strong');
    valueEl.textContent = value || '—';
    card.appendChild(labelEl);
    card.appendChild(valueEl);
    parent.appendChild(card);
  };

  const appendDisclosure = (parent, title, countLabel, body) => {
    const disclosure = document.createElement('details');
    disclosure.className = 'forms-modal-disclosure';

    const summary = document.createElement('summary');
    const label = document.createElement('strong');
    label.textContent = title;
    const count = document.createElement('span');
    count.textContent = countLabel;
    summary.appendChild(label);
    summary.appendChild(count);

    const content = document.createElement('div');
    content.className = 'forms-modal-disclosure__body';
    content.appendChild(body);

    disclosure.appendChild(summary);
    disclosure.appendChild(content);
    parent.appendChild(disclosure);
  };

  const closeSubmissionModal = () => {
    if (!activeModal) return;
    activeModal.remove();
    activeModal = null;
    document.body.classList.remove('forms-modal-open');
  };

  const openSubmissionModal = (item) => {
    closeSubmissionModal();

    const importMeta = getImportMeta(item);
    const fields = getSubmissionFields(item);
    const fieldCount = Object.keys(fields).length;
    const importMetaWithoutContacts = Object.fromEntries(
      Object.entries(importMeta).filter(([key]) => !['contactName', 'contactEmail', 'contactPhone'].includes(key))
    );

    const modal = document.createElement('div');
    modal.className = 'forms-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Submission detail');

    const backdrop = document.createElement('button');
    backdrop.className = 'forms-modal__backdrop';
    backdrop.type = 'button';
    backdrop.setAttribute('aria-label', 'Close submission detail');
    backdrop.addEventListener('click', closeSubmissionModal);

    const panel = document.createElement('div');
    panel.className = 'forms-modal__panel';

    const header = document.createElement('div');
    header.className = 'forms-modal__header';

    const heading = document.createElement('div');
    heading.className = 'forms-modal__heading';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'panel-card__tag';
    eyebrow.textContent = `${getSiteDisplayName(item.site_id, importMeta.siteName)} / ${importMeta.formName || item.form_id || 'Form'}`;
    const title = document.createElement('h2');
    title.textContent = importMeta.contactName || fields.name || fields.full_name || fields.email || 'Form submission';
    const subtitle = document.createElement('p');
    subtitle.textContent = formatTimestamp(item.submitted_at);
    heading.appendChild(eyebrow);
    heading.appendChild(title);
    heading.appendChild(subtitle);

    const closeButton = document.createElement('button');
    closeButton.className = 'forms-button secondary forms-modal__close';
    closeButton.type = 'button';
    closeButton.textContent = 'Close';
    closeButton.addEventListener('click', closeSubmissionModal);

    header.appendChild(heading);
    header.appendChild(closeButton);

    const content = document.createElement('div');
    content.className = 'forms-modal__content';

    const metaGrid = document.createElement('div');
    metaGrid.className = 'forms-modal-meta';
    appendMetaCard(metaGrid, 'Email', importMeta.contactEmail || fields.email || fields.Email || '—');
    appendMetaCard(metaGrid, 'Phone', importMeta.contactPhone || fields.phone || fields.Phone || '—');
    appendMetaCard(metaGrid, 'Source page', item.page_url || item.referrer || '—');
    content.appendChild(metaGrid);

    const section = document.createElement('section');
    section.className = 'forms-modal-section';
    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'forms-modal-section__heading';
    const sectionTitle = document.createElement('h3');
    sectionTitle.textContent = 'Submitted fields';
    const sectionNote = document.createElement('p');
    sectionNote.textContent = `${fieldCount} field${fieldCount === 1 ? '' : 's'}`;
    sectionHeader.appendChild(sectionTitle);
    sectionHeader.appendChild(sectionNote);
    section.appendChild(sectionHeader);
    section.appendChild(buildDataGrid(fields));
    content.appendChild(section);

    const sourceGrid = document.createElement('div');
    sourceGrid.className = 'forms-data-grid forms-data-grid--single';
    [
      ['Site ID', item.site_id],
      ['Form ID', item.form_id],
      ['Origin', item.origin],
      ['Referrer', item.referrer],
      ['IP', item.ip],
      ['Imported at', importMeta.importedAt],
    ].forEach(([label, value]) => {
      const row = document.createElement('div');
      row.className = 'forms-data-row';
      const labelEl = document.createElement('div');
      labelEl.className = 'forms-data-label';
      labelEl.textContent = label;
      const valueEl = document.createElement('div');
      valueEl.className = 'forms-data-value';
      valueEl.textContent = label.includes('at') ? formatTimestamp(value) : formatValue(value);
      row.appendChild(labelEl);
      row.appendChild(valueEl);
      sourceGrid.appendChild(row);
    });
    appendDisclosure(content, 'Source details', '6 items', sourceGrid);

    if (Object.keys(importMetaWithoutContacts).length > 0) {
      appendDisclosure(
        content,
        'Import metadata',
        `${Object.keys(importMetaWithoutContacts).length} items`,
        buildDataGrid(importMetaWithoutContacts)
      );
    }

    const raw = document.createElement('pre');
    raw.className = 'forms-modal-raw';
    raw.textContent = JSON.stringify(item.data || {}, null, 2);
    appendDisclosure(content, 'Raw payload', 'JSON', raw);

    panel.appendChild(header);
    panel.appendChild(content);
    modal.appendChild(backdrop);
    modal.appendChild(panel);
    document.body.appendChild(modal);
    document.body.classList.add('forms-modal-open');
    activeModal = modal;
    closeButton.focus();
  };

  const renderSubmissions = (items) => {
    submissionsBody.innerHTML = '';
    closeSubmissionModal();

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
      row.className = 'forms-table__row';
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', `Open submission from ${item.site_id || 'unknown site'}`);

      const submittedCell = document.createElement('td');
      submittedCell.dataset.label = 'Submitted';
      submittedCell.textContent = formatTimestamp(item.submitted_at);

      const siteCell = document.createElement('td');
      siteCell.dataset.label = 'Site';
      siteCell.textContent = getSiteDisplayName(item.site_id, getImportMeta(item).siteName);

      const formCell = document.createElement('td');
      formCell.dataset.label = 'Form';
      formCell.textContent = item.form_id || '—';

      const originCell = document.createElement('td');
      originCell.dataset.label = 'Origin';
      originCell.textContent = item.origin || '—';

      const previewCell = document.createElement('td');
      previewCell.className = 'forms-table__preview';
      const preview = document.createElement('button');
      preview.className = 'forms-preview-button';
      preview.type = 'button';
      preview.textContent = buildPreview(item.data);
      preview.addEventListener('click', (event) => {
        event.stopPropagation();
        openSubmissionModal(item);
      });
      previewCell.appendChild(preview);

      row.appendChild(submittedCell);
      row.appendChild(siteCell);
      row.appendChild(formCell);
      row.appendChild(originCell);
      row.appendChild(previewCell);

      row.addEventListener('click', () => openSubmissionModal(item));
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openSubmissionModal(item);
        }
      });

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

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeSubmissionModal();
    }
  });

  initDashboard();
}
