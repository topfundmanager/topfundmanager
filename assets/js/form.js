/**
 * Multi-step form handler for VIP 1-on-1 Experience Application
 * Uses Resend via Cloudflare Pages Functions for email delivery
 * Includes spam prevention measures
 */
(function() {
  'use strict';

  const TOTAL_STEPS = 6;
  let currentStep = 1;
  let formLoadTime = Date.now(); // Track when form was loaded for timing validation

  // Form field definitions by step
  const stepFields = {
    1: ['firstName', 'lastName', 'email', 'phone'],
    2: ['howFound', 'previousApplication', 'occupation', 'cityState'],
    3: ['goals', 'areasNeedHelp', 'experienceLevel', 'currentRealEstate'],
    4: ['rentalUnitsGoal', 'currentIncome', 'targetIncome'],
    5: ['mainObstacle', 'whySelected'],
    6: ['investmentBudget', 'alternativeOption', 'creditScore']
  };

  // Required fields
  const requiredFields = ['firstName', 'lastName', 'email', 'phone', 'areasNeedHelp', 'experienceLevel', 'currentRealEstate', 'investmentBudget'];

  // Max lengths for validation (must match server)
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
    whySelected: 2000
  };

  function init() {
    const form = document.getElementById('vip-application-form');
    if (!form) return;

    // Record form load time
    formLoadTime = Date.now();

    // Set up navigation
    document.querySelectorAll('.form-next').forEach(btn => {
      btn.addEventListener('click', handleNext);
    });

    document.querySelectorAll('.form-prev').forEach(btn => {
      btn.addEventListener('click', handlePrev);
    });

    // Handle form submission
    form.addEventListener('submit', handleSubmit);

    // Update progress bar
    updateProgress();
  }

  function validateStep(step) {
    const fields = stepFields[step];
    let valid = true;
    let firstInvalid = null;

    fields.forEach(fieldName => {
      const field = document.querySelector(`[name="${fieldName}"]`);
      if (!field) return;

      const isRequired = requiredFields.includes(fieldName);
      const value = field.value.trim();

      // Clear previous errors
      field.classList.remove('error');
      const errorEl = field.parentElement.querySelector('.field-error');
      if (errorEl) errorEl.remove();

      // Validate required fields
      if (isRequired && !value) {
        valid = false;
        showFieldError(field, 'This field is required');
        if (!firstInvalid) firstInvalid = field;
        return;
      }

      // Validate email format
      if (fieldName === 'email' && value && !isValidEmail(value)) {
        valid = false;
        showFieldError(field, 'Please enter a valid email address');
        if (!firstInvalid) firstInvalid = field;
        return;
      }

      // Validate phone format
      if (fieldName === 'phone' && value && !isValidPhone(value)) {
        valid = false;
        showFieldError(field, 'Please enter a valid phone number');
        if (!firstInvalid) firstInvalid = field;
        return;
      }

      // Validate name format (letters, spaces, hyphens, apostrophes only)
      if ((fieldName === 'firstName' || fieldName === 'lastName') && value && !isValidName(value)) {
        valid = false;
        showFieldError(field, 'Name can only contain letters, spaces, hyphens, and apostrophes');
        if (!firstInvalid) firstInvalid = field;
        return;
      }

      // Validate max length
      if (maxLengths[fieldName] && value.length > maxLengths[fieldName]) {
        valid = false;
        showFieldError(field, `Maximum ${maxLengths[fieldName]} characters allowed`);
        if (!firstInvalid) firstInvalid = field;
        return;
      }
    });

    if (firstInvalid) {
      firstInvalid.focus();
    }

    return valid;
  }

  function showFieldError(field, message) {
    field.classList.add('error');
    const errorEl = document.createElement('span');
    errorEl.className = 'field-error';
    errorEl.textContent = message;
    field.parentElement.appendChild(errorEl);
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function isValidPhone(phone) {
    // Allow various phone formats: digits, spaces, dashes, parentheses, plus sign
    return /^[\d\s\-\(\)\+]+$/.test(phone);
  }

  function isValidName(name) {
    // Only letters, spaces, hyphens, apostrophes
    return /^[a-zA-Z\s'-]+$/.test(name);
  }

  function handleNext(e) {
    e.preventDefault();

    if (!validateStep(currentStep)) {
      return;
    }

    if (currentStep < TOTAL_STEPS) {
      showStep(currentStep + 1);
    }
  }

  function handlePrev(e) {
    e.preventDefault();

    if (currentStep > 1) {
      showStep(currentStep - 1);
    }
  }

  function showStep(step) {
    // Hide all steps
    document.querySelectorAll('.form-step').forEach(el => {
      el.style.display = 'none';
    });

    // Show target step
    const targetStep = document.getElementById(`step-${step}`);
    if (targetStep) {
      targetStep.style.display = 'block';
      currentStep = step;
      updateProgress();

      // Scroll to form
      targetStep.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function updateProgress() {
    const percentage = Math.round((currentStep / TOTAL_STEPS) * 100);

    const progressBar = document.querySelector('.progress-bar-fill');
    if (progressBar) {
      progressBar.style.width = `${percentage}%`;
    }

    const progressText = document.querySelector('.progress-text');
    if (progressText) {
      progressText.textContent = `Step ${currentStep} of ${TOTAL_STEPS}`;
    }

    const percentageText = document.querySelector('.progress-percentage');
    if (percentageText) {
      percentageText.textContent = `${percentage}%`;
    }
  }

  function collectFormData() {
    const form = document.getElementById('vip-application-form');
    const formData = new FormData(form);
    const data = {};

    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }

    // Add timestamp for timing validation (spam prevention)
    data._timestamp = formLoadTime.toString();

    return data;
  }

  async function handleSubmit(e) {
    e.preventDefault();

    // Validate final step
    if (!validateStep(currentStep)) {
      return;
    }

    const submitBtn = document.querySelector('.form-submit');
    const originalText = submitBtn.textContent;

    try {
      // Show loading state
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      const formData = collectFormData();

      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (result.success) {
        showSuccess();
      } else {
        showError(result.error || 'Something went wrong. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    } catch (error) {
      console.error('Form submission error:', error);
      showError('Network error. Please check your connection and try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }

  function showSuccess() {
    const form = document.getElementById('vip-application-form');
    const successMessage = document.getElementById('form-success');

    if (form) form.style.display = 'none';
    if (successMessage) successMessage.style.display = 'block';

    // Scroll to success message
    if (successMessage) {
      successMessage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function showError(message) {
    const errorContainer = document.querySelector('.form-error');
    if (errorContainer) {
      errorContainer.textContent = message;
      errorContainer.style.display = 'block';

      // Hide after 5 seconds
      setTimeout(() => {
        errorContainer.style.display = 'none';
      }, 5000);
    } else {
      alert(message);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
