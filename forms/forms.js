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
  const submissionsTab = document.getElementById('submissions-tab');
  const seoTab = document.getElementById('seo-tab');
  const submissionsPanel = document.getElementById('submissions-panel');
  const seoPanel = document.getElementById('seo-panel');
  const submissionsBody = document.getElementById('submissions-body');
  const siteFilter = document.getElementById('site-filter');
  const submissionCount = document.getElementById('submission-count');
  const dashboardAlert = document.getElementById('dashboard-alert');
  const refreshButton = document.getElementById('refresh');
  const logoutButton = document.getElementById('logout');
  const seoSiteSelect = document.getElementById('seo-site-select');
  const seoWorkspace = document.getElementById('seo-workspace');
  const seoForm = document.getElementById('seo-form');
  const seoAlert = document.getElementById('seo-alert');
  const seoRecordStatus = document.getElementById('seo-record-status');
  const seoOpenSite = document.getElementById('seo-open-site');
  const seoHealthScore = document.getElementById('seo-health-score');
  const seoChecklist = document.getElementById('seo-checklist');
  const seoChecklistCount = document.getElementById('seo-checklist-count');
  const seoPreviewTitle = document.getElementById('seo-preview-title');
  const seoPreviewUrl = document.getElementById('seo-preview-url');
  const seoPreviewDescription = document.getElementById('seo-preview-description');
  const seoJsonEndpoint = document.getElementById('seo-json-endpoint');
  const seoLlmsEndpoint = document.getElementById('seo-llms-endpoint');
  const seoRobotsEndpoint = document.getElementById('seo-robots-endpoint');
  const seoSourceSnapshot = document.getElementById('seo-source-snapshot');
  const seoSourceChecked = document.getElementById('seo-source-checked');
  const seoSaveState = document.getElementById('seo-save-state');
  const seoRevision = document.getElementById('seo-revision');
  const seoSaveBar = document.querySelector('.seo-save-bar');
  const seoSaveButton = document.getElementById('seo-save');
  const seoResetButton = document.getElementById('seo-reset');
  let activeModal = null;
  let activeDashboardView = 'submissions';
  let seoProfiles = [];
  let activeSeoSiteId = '';
  let seoOriginalSignature = '';
  let seoIsDirty = false;

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

  const SEO_STRING_FIELDS = [
    'site_url',
    'management_status',
    'seo_title',
    'meta_description',
    'canonical_url',
    'robots_directive',
    'language_code',
    'og_title',
    'og_description',
    'og_image_url',
    'twitter_card',
    'twitter_title',
    'twitter_description',
    'twitter_image_url',
    'entity_type',
    'entity_name',
    'entity_description',
    'llms_summary',
  ];

  const SEO_LIST_FIELDS = [
    'audience',
    'services',
    'service_areas',
    'search_topics',
    'same_as',
    'llms_key_facts',
  ];

  const setFormValue = (name, value) => {
    const field = seoForm?.elements.namedItem(name);
    if (field) field.value = value ?? '';
  };

  const getFormValue = (name) => {
    const field = seoForm?.elements.namedItem(name);
    return field ? field.value.trim() : '';
  };

  const listToText = (value) => (Array.isArray(value) ? value.join('\n') : '');

  const textToList = (value) => String(value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

  const formatJson = (value, fallback) => {
    const normalized = value && typeof value === 'object' ? value : fallback;
    return JSON.stringify(normalized, null, 2);
  };

  const parseJsonField = (name, expectedType = 'object') => {
    const raw = getFormValue(name);
    let parsed;
    try {
      parsed = JSON.parse(raw || (expectedType === 'array' ? '[]' : '{}'));
    } catch {
      throw new Error(`${formatLabel(name)} must contain valid JSON.`);
    }

    const isValid = expectedType === 'array'
      ? Array.isArray(parsed)
      : parsed && typeof parsed === 'object' && !Array.isArray(parsed);
    if (!isValid) {
      throw new Error(`${formatLabel(name)} must be a JSON ${expectedType}.`);
    }
    return parsed;
  };

  const getSeoFormSignature = () => {
    if (!seoForm) return '';
    return JSON.stringify(Array.from(new FormData(seoForm).entries()));
  };

  const getSeoFormPayload = () => {
    const profile = {};
    SEO_STRING_FIELDS.forEach((field) => {
      profile[field] = getFormValue(field);
    });
    SEO_LIST_FIELDS.forEach((field) => {
      profile[field] = textToList(getFormValue(field));
    });
    profile.faqs = parseJsonField('faqs', 'array');
    profile.structured_data = parseJsonField('structured_data');
    profile.ai_crawler_policy = parseJsonField('ai_crawler_policy');
    return profile;
  };

  const formatCheckedAt = (value) => {
    if (!value) return 'Not checked';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not checked' : `Checked ${date.toLocaleDateString()}`;
  };

  const updateSeoCounters = () => {
    document.querySelectorAll('[data-count-for]').forEach((counter) => {
      const field = document.getElementById(counter.dataset.countFor);
      if (!field) return;
      const preferredMax = field.id === 'seo-title' ? 60 : 160;
      counter.textContent = `${field.value.length} / ${preferredMax}`;
    });
  };

  const getJsonOrFallback = (name, fallback) => {
    try {
      return JSON.parse(getFormValue(name) || JSON.stringify(fallback));
    } catch {
      return fallback;
    }
  };

  const buildSeoChecks = () => {
    const title = getFormValue('seo_title');
    const description = getFormValue('meta_description');
    const canonical = getFormValue('canonical_url');
    const services = textToList(getFormValue('services'));
    const audiences = textToList(getFormValue('audience'));
    const topics = textToList(getFormValue('search_topics'));
    const facts = textToList(getFormValue('llms_key_facts'));
    const sameAs = textToList(getFormValue('same_as'));
    const faqs = getJsonOrFallback('faqs', []);
    const schema = getJsonOrFallback('structured_data', {});
    const crawlers = getJsonOrFallback('ai_crawler_policy', {});

    return [
      { label: 'SEO title is descriptive and 30–65 characters', complete: title.length >= 30 && title.length <= 65 },
      { label: 'Meta description is 120–170 characters', complete: description.length >= 120 && description.length <= 170 },
      { label: 'Canonical URL uses HTTPS', complete: canonical.startsWith('https://') },
      { label: 'Robots directive permits indexing', complete: getFormValue('robots_directive').includes('index') && !getFormValue('robots_directive').includes('noindex') },
      { label: 'Open Graph title, description, and image are set', complete: Boolean(getFormValue('og_title') && getFormValue('og_description') && getFormValue('og_image_url')) },
      { label: 'Entity name, type, and factual description are set', complete: Boolean(getFormValue('entity_name') && getFormValue('entity_type') && getFormValue('entity_description').length >= 80) },
      { label: 'Primary audience is defined', complete: audiences.length > 0 },
      { label: 'Services are explicitly listed', complete: services.length > 0 },
      { label: 'Search topics reflect published services', complete: topics.length >= 3 },
      { label: 'Official corroborating profiles are linked', complete: sameAs.length > 0 },
      { label: 'Useful factual FAQs are included', complete: Array.isArray(faqs) && faqs.length >= 2 },
      { label: 'Valid JSON-LD entity markup is present', complete: Boolean(schema?.['@context'] && (schema?.['@type'] || schema?.['@graph'])) },
      { label: 'LLM summary explains entity, audience, and offering', complete: getFormValue('llms_summary').length >= 120 },
      { label: 'Machine-readable key facts are listed', complete: facts.length >= 3 },
      { label: 'Major answer-engine crawlers have an explicit policy', complete: Boolean(crawlers?.['OAI-SearchBot'] && crawlers?.['ChatGPT-User'] && crawlers?.ClaudeBot && crawlers?.PerplexityBot) },
    ];
  };

  const updateSeoPreview = () => {
    if (!seoForm || seoWorkspace.hidden) return;

    seoPreviewTitle.textContent = getFormValue('seo_title') || 'SEO title preview';
    seoPreviewUrl.textContent = getFormValue('canonical_url') || getFormValue('site_url') || 'https://example.com/';
    seoPreviewDescription.textContent = getFormValue('meta_description') || 'A clear meta description will appear here.';
    updateSeoCounters();

    const checks = buildSeoChecks();
    const completed = checks.filter((check) => check.complete).length;
    const score = Math.round((completed / checks.length) * 100);
    seoHealthScore.textContent = `${score}%`;
    seoChecklistCount.textContent = `${completed}/${checks.length}`;
    seoChecklist.innerHTML = '';
    checks.forEach((check) => {
      const item = document.createElement('li');
      item.textContent = check.label;
      item.classList.toggle('is-complete', check.complete);
      seoChecklist.appendChild(item);
    });
  };

  const updateSeoDirtyState = () => {
    seoIsDirty = Boolean(seoOriginalSignature && getSeoFormSignature() !== seoOriginalSignature);
    seoSaveBar?.classList.toggle('is-dirty', seoIsDirty);
    seoSaveState.textContent = seoIsDirty ? 'Unsaved changes' : 'No unsaved changes';
  };

  const setSeoEndpointLinks = (siteId) => {
    const encoded = encodeURIComponent(siteId);
    const jsonUrl = `/api/seo/${encoded}`;
    const llmsUrl = `/api/seo/${encoded}/llms.txt`;
    const robotsUrl = `/api/seo/${encoded}/robots.txt`;
    seoJsonEndpoint.href = jsonUrl;
    seoJsonEndpoint.textContent = jsonUrl;
    seoLlmsEndpoint.href = llmsUrl;
    seoLlmsEndpoint.textContent = llmsUrl;
    seoRobotsEndpoint.href = robotsUrl;
    seoRobotsEndpoint.textContent = robotsUrl;
  };

  const renderSeoProfile = (profile) => {
    if (!profile) return;
    activeSeoSiteId = profile.site_id;
    seoSiteSelect.value = profile.site_id;

    SEO_STRING_FIELDS.forEach((field) => setFormValue(field, profile[field] || ''));
    SEO_LIST_FIELDS.forEach((field) => setFormValue(field, listToText(profile[field])));
    setFormValue('faqs', formatJson(profile.faqs, []));
    setFormValue('structured_data', formatJson(profile.structured_data, {}));
    setFormValue('ai_crawler_policy', formatJson(profile.ai_crawler_policy, {}));

    const isReady = profile.management_status === 'ready';
    seoRecordStatus.textContent = isReady ? 'Ready for deployment' : 'Draft';
    seoOpenSite.href = profile.site_url || '#';
    seoOpenSite.setAttribute('aria-label', `Open ${profile.site_name || profile.site_id}`);
    seoSourceSnapshot.textContent = formatJson(profile.source_snapshot, {});
    seoSourceChecked.textContent = formatCheckedAt(profile.source_checked_at);
    seoRevision.textContent = `Revision ${profile.revision || 1}${profile.updated_by ? ` · Updated by ${profile.updated_by}` : ''}`;
    setSeoEndpointLinks(profile.site_id);
    seoWorkspace.hidden = false;

    seoOriginalSignature = getSeoFormSignature();
    seoIsDirty = false;
    seoSaveBar?.classList.remove('is-dirty');
    seoSaveState.textContent = 'No unsaved changes';
    updateSeoPreview();
  };

  const loadSeoProfiles = async ({ preserveSelection = true } = {}) => {
    clearAlert(seoAlert);
    seoSiteSelect.disabled = true;
    seoRecordStatus.textContent = 'Loading';
    const previous = preserveSelection ? activeSeoSiteId : '';
    const data = await apiRequest('/api/forms/seo');
    seoProfiles = data.profiles || [];
    seoSiteSelect.innerHTML = '';

    if (!seoProfiles.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No SEO profiles found';
      seoSiteSelect.appendChild(option);
      seoRecordStatus.textContent = 'No profiles';
      seoWorkspace.hidden = true;
      return;
    }

    seoProfiles.forEach((profile) => {
      const option = document.createElement('option');
      option.value = profile.site_id;
      option.textContent = getSiteDisplayName(profile.site_id, profile.site_name);
      seoSiteSelect.appendChild(option);
    });

    seoSiteSelect.disabled = false;
    const selected = seoProfiles.find((profile) => profile.site_id === previous) || seoProfiles[0];
    renderSeoProfile(selected);
  };

  const setDashboardView = async (view) => {
    activeDashboardView = view;
    const showingSeo = view === 'seo';
    submissionsPanel.hidden = showingSeo;
    seoPanel.hidden = !showingSeo;
    submissionsTab.classList.toggle('workspace-tab--active', !showingSeo);
    submissionsTab.setAttribute('aria-selected', String(!showingSeo));
    seoTab.classList.toggle('workspace-tab--active', showingSeo);
    seoTab.setAttribute('aria-selected', String(showingSeo));
    refreshButton.textContent = showingSeo ? 'Reload SEO' : 'Refresh';

    if (showingSeo && !seoProfiles.length) {
      try {
        await loadSeoProfiles();
      } catch (error) {
        setAlert(seoAlert, error.message || 'Unable to load SEO profiles.');
        seoRecordStatus.textContent = 'Load failed';
      }
    }
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

  const getPreviewValue = (fields, keys) => {
    const match = Object.entries(fields).find(([key, value]) => {
      if (value === null || value === undefined || value === '') return false;
      return keys.includes(key.toLowerCase());
    });

    if (!match) return '';
    return formatValue(match[1]);
  };

  const buildPreview = (data) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return 'No data';
    const entries = Object.entries(data).filter(([key]) => key !== '_import');
    if (entries.length === 0) return 'No fields';

    const fields = Object.fromEntries(entries);
    const previewParts = [
      ['Name', getPreviewValue(fields, ['name', 'full_name', 'fullname', 'contact_name', 'lead_name', 'first_name'])],
      ['Email', getPreviewValue(fields, ['email', 'email_address', 'contact_email', 'lead_email'])],
      ['Phone', getPreviewValue(fields, ['phone', 'phone_number', 'contact_phone', 'lead_phone', 'nominee_phone'])],
      ['Note', getPreviewValue(fields, ['message', 'comments', 'description', 'details', 'summary', 'case_type', 'casetype', 'lead_urgency'])]
    ]
      .filter(([, value]) => value)
      .map(([label, value]) => `${label}: ${value}`);

    if (previewParts.length > 0) {
      return previewParts.slice(0, 4).join(' | ');
    }

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
      const previewText = document.createElement('span');
      previewText.className = 'forms-preview-button__text';
      previewText.textContent = buildPreview(item.data);
      preview.appendChild(previewText);
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
    if (activeDashboardView === 'seo') {
      if (seoIsDirty && !window.confirm('Reload SEO profiles and discard your unsaved changes?')) {
        return;
      }
      loadSeoProfiles().catch((error) => setAlert(seoAlert, error.message));
      return;
    }
    loadSubmissions().catch((error) => setAlert(dashboardAlert, error.message));
  });

  submissionsTab.addEventListener('click', () => {
    setDashboardView('submissions');
  });

  seoTab.addEventListener('click', () => {
    setDashboardView('seo');
  });

  seoSiteSelect.addEventListener('change', () => {
    const nextSiteId = seoSiteSelect.value;
    if (seoIsDirty && !window.confirm('Switch sites and discard your unsaved changes?')) {
      seoSiteSelect.value = activeSeoSiteId;
      return;
    }
    const profile = seoProfiles.find((item) => item.site_id === nextSiteId);
    if (profile) renderSeoProfile(profile);
  });

  seoForm.addEventListener('input', () => {
    updateSeoPreview();
    updateSeoDirtyState();
  });

  seoForm.addEventListener('change', () => {
    updateSeoPreview();
    updateSeoDirtyState();
  });

  seoResetButton.addEventListener('click', () => {
    const profile = seoProfiles.find((item) => item.site_id === activeSeoSiteId);
    if (profile) renderSeoProfile(profile);
  });

  seoForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearAlert(seoAlert);
    seoSaveButton.disabled = true;
    seoResetButton.disabled = true;
    seoSaveState.textContent = 'Saving…';

    try {
      const payload = getSeoFormPayload();
      const data = await apiRequest('/api/forms/seo', {
        method: 'PUT',
        body: JSON.stringify({ siteId: activeSeoSiteId, profile: payload }),
      });
      const current = seoProfiles.find((item) => item.site_id === activeSeoSiteId) || {};
      const saved = { ...current, ...(data.profile || {}), site_name: current.site_name };
      seoProfiles = seoProfiles.map((item) => item.site_id === activeSeoSiteId ? saved : item);
      renderSeoProfile(saved);
      setAlert(seoAlert, 'SEO profile saved. The delivery endpoints now expose this revision when its status is ready.', 'success');
    } catch (error) {
      setAlert(seoAlert, error.message || 'Unable to save SEO profile.');
      seoSaveState.textContent = 'Save failed — changes are still in this form';
      seoSaveBar?.classList.add('is-dirty');
    } finally {
      seoSaveButton.disabled = false;
      seoResetButton.disabled = false;
    }
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

  window.addEventListener('beforeunload', (event) => {
    if (!seoIsDirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  initDashboard();
}
