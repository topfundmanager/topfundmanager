/**
 * Multi-step form handler for Cash Offer Property Form
 * Uses Resend via Cloudflare Pages Functions for email delivery
 * Includes spam prevention measures
 */
(function() {
  'use strict';

  const TOTAL_STEPS = 4;
  let currentStep = 1;
  let formLoadTime = Date.now();

  // Form field definitions by step
  const stepFields = {
    1: ['streetAddress', 'addressLine2', 'city', 'state', 'zip', 'country'],
    2: ['firstName', 'lastName', 'email', 'phone', 'bedrooms', 'squareFootage', 'propertyType', 'hoaType', 'annualHoaFee'],
    3: ['hvacUnits', 'hvacAge', 'roofAge', 'foundationType', 'finishedBasement', 'hvacInBasement', 'basementBedrooms', 'basementBathrooms', 'basementFlooring'],
    4: ['kitchenCountertops', 'kitchenAppliances', 'hasPool', 'poolType', 'lookingForNextHome', 'currentlyListed', 'wasteHandling', 'waterSupply']
  };

  // Required fields
  const requiredFields = ['streetAddress', 'city', 'state', 'zip', 'firstName', 'lastName', 'email', 'phone'];

  // Max lengths for validation
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
    roofAge: 100
  };

  function init() {
    const form = document.getElementById('cash-offer-form');
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

      // Validate name format
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
    return /^[\d\s\-\(\)\+]+$/.test(phone);
  }

  function isValidName(name) {
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
    const form = document.getElementById('cash-offer-form');
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

      const response = await fetch('/api/cash-offer', {
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
    const form = document.getElementById('cash-offer-form');
    const successMessage = document.getElementById('form-success');
    const progressBar = document.querySelector('.form-progress');

    if (form) form.style.display = 'none';
    if (progressBar) progressBar.style.display = 'none';
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
