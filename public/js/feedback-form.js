/**
 * KSCW Feedback Form — Type selection, validation, file upload, submission
 *
 * Submits to POST /items/feedback on Directus.
 * Uses multipart/form-data for screenshot file upload.
 * Includes Turnstile CAPTCHA token in form body.
 */
(function () {
  'use strict';

  var DIRECTUS_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'https://directus-dev.kscw.ch' : 'https://directus.kscw.ch';
  var TURNSTILE_SITE_KEY = '0x4AAAAAACoYmx3xiDfRbmv9';
  var MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
  var ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

  var form = document.getElementById('feedback-form');
  var feedback = document.getElementById('form-feedback');
  var submitBtn = form ? form.querySelector('.form-submit') : null;
  var typePills = document.querySelectorAll('.feedback-type-pill');
  var dropzone = document.getElementById('feedback-dropzone');
  var fileInput = document.getElementById('feedback-screenshot');
  var filePreview = document.getElementById('feedback-file-preview');
  var fileName = document.getElementById('feedback-file-name');
  var fileRemove = document.getElementById('feedback-file-remove');

  if (!form) return;

  // ── State ───────────────────────────────────────────────────────────
  var selectedType = 'bug';
  var selectedFile = null;

  // ── i18n ────────────────────────────────────────────────────────────
  function getLocale() {
    return (document.documentElement.lang === 'en') ? 'en' : 'de';
  }

  var messages = {
    de: {
      titleRequired: 'Bitte gib einen Titel ein',
      descRequired: 'Bitte beschreibe dein Anliegen',
      captchaRequired: 'Bitte bestätige, dass du kein Roboter bist',
      fileSize: 'Datei ist zu gross (max 5 MB)',
      fileType: 'Nur PNG, JPG und WebP erlaubt',
      success: 'Danke für dein Feedback! Wir schauen es uns an.',
      successBug: 'Danke! Ein GitHub Issue wurde automatisch erstellt.',
      successFeature: 'Danke! Ein GitHub Issue wurde automatisch erstellt.',
      error: 'Etwas ist schiefgelaufen. Bitte versuche es nochmal.',
      submit: 'Absenden',
    },
    en: {
      titleRequired: 'Please enter a title',
      descRequired: 'Please describe your concern',
      captchaRequired: "Please confirm you're not a robot",
      fileSize: 'File is too large (max 5 MB)',
      fileType: 'Only PNG, JPG and WebP allowed',
      success: "Thanks for your feedback! We'll take a look.",
      successBug: 'Thanks! A GitHub Issue has been created automatically.',
      successFeature: 'Thanks! A GitHub Issue has been created automatically.',
      error: 'Something went wrong. Please try again.',
      submit: 'Submit',
    },
  };

  function msg(key) {
    var locale = getLocale();
    return (messages[locale] && messages[locale][key]) || messages.de[key] || key;
  }

  // ── Turnstile ───────────────────────────────────────────────────────
  var turnstileWidgetId = null;
  var turnstileContainer = document.getElementById('turnstile-container');

  function renderTurnstile() {
    if (!turnstileContainer || !window.turnstile) return;
    if (turnstileWidgetId !== null) return;
    turnstileWidgetId = window.turnstile.render(turnstileContainer, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: 'auto',
      size: 'flexible',
    });
  }

  if (window.turnstile) {
    renderTurnstile();
  } else {
    var pollCount = 0;
    var poll = setInterval(function () {
      pollCount++;
      if (window.turnstile) {
        clearInterval(poll);
        renderTurnstile();
      } else if (pollCount > 20) {
        clearInterval(poll); // Stop after 10s
      }
    }, 500);
  }

  // ── Type Pills ──────────────────────────────────────────────────────
  typePills.forEach(function (pill) {
    pill.addEventListener('click', function () {
      typePills.forEach(function (p) { p.classList.remove('active'); });
      pill.classList.add('active');
      selectedType = pill.getAttribute('data-type');
    });
  });

  // ── File Upload (drag & drop + click) ──────────────────────────────
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', function () {
      fileInput.click();
    });

    dropzone.addEventListener('dragover', function (e) {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', function () {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', function () {
      if (fileInput.files.length > 0) {
        handleFile(fileInput.files[0]);
      }
    });
  }

  if (fileRemove) {
    fileRemove.addEventListener('click', function () {
      clearFile();
    });
  }

  function handleFile(file) {
    if (file.size > MAX_FILE_SIZE) {
      showFeedback(msg('fileSize'), 'error');
      return;
    }
    if (ALLOWED_TYPES.indexOf(file.type) === -1) {
      showFeedback(msg('fileType'), 'error');
      return;
    }
    selectedFile = file;
    if (fileName) fileName.textContent = file.name;
    if (filePreview) filePreview.hidden = false;
    if (dropzone) dropzone.hidden = true;
  }

  function clearFile() {
    selectedFile = null;
    if (fileInput) fileInput.value = '';
    if (filePreview) filePreview.hidden = true;
    if (dropzone) dropzone.hidden = false;
  }

  // ── Validation ──────────────────────────────────────────────────────
  function validate() {
    var title = form.querySelector('#feedback-title');
    var desc = form.querySelector('#feedback-description');
    var errors = [];

    form.querySelectorAll('.error').forEach(function (el) {
      el.classList.remove('error');
    });

    if (!title.value.trim()) {
      title.classList.add('error');
      errors.push(msg('titleRequired'));
    }

    if (!desc.value.trim()) {
      desc.classList.add('error');
      errors.push(msg('descRequired'));
    }

    var turnstileResponse = window.turnstile
      ? window.turnstile.getResponse(turnstileWidgetId)
      : null;
    if (!turnstileResponse) {
      errors.push(msg('captchaRequired'));
    }

    var consentBox = document.getElementById('privacy-consent');
    if (consentBox && !consentBox.checked) {
      errors.push(i18n.t('contactValidationConsent'));
    }

    if (errors.length > 0) {
      showFeedback(errors[0], 'error');
      return null;
    }

    return {
      title: title.value.trim(),
      description: desc.value.trim(),
      turnstileResponse: turnstileResponse,
    };
  }

  // ── Submit ──────────────────────────────────────────────────────────
  // Save original button content for restoration after submission.
  // This is safe: submitBtnOriginalChildren captures the button's own
  // static DOM nodes (icon SVG + text), not any user-provided content.
  var submitBtnOriginalChildren = [];
  if (submitBtn) {
    var nodes = submitBtn.childNodes;
    for (var i = 0; i < nodes.length; i++) {
      submitBtnOriginalChildren.push(nodes[i].cloneNode(true));
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    hideFeedback();

    var data = validate();
    if (!data) return;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '...';
    }

    var formData = new FormData();
    formData.append('type', selectedType);
    formData.append('title', data.title);
    formData.append('description', data.description);
    formData.append('source', 'website');
    formData.append('status', 'new');
    var urlField = form.querySelector('#feedback-url');
    if (urlField && urlField.value.trim()) {
      formData.append('source_url', urlField.value.trim());
    }

    var nameField = form.querySelector('#feedback-name');
    if (nameField && nameField.value.trim()) {
      formData.append('name', nameField.value.trim());
    }

    var emailField = form.querySelector('#feedback-email');
    if (emailField && emailField.value.trim()) {
      formData.append('email', emailField.value.trim());
    }

    if (selectedFile) {
      formData.append('screenshot', selectedFile);
    }

    fetch(DIRECTUS_URL + '/items/feedback', {
      method: 'POST',
      headers: { 'X-Turnstile-Token': data.turnstileResponse },
      body: formData,
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (err) {
            throw new Error(err.message || 'HTTP ' + res.status);
          });
        }
        return res.json();
      })
      .then(function () {
        var successMsg = selectedType === 'bug'
          ? msg('successBug')
          : selectedType === 'feature'
            ? msg('successFeature')
            : msg('success');
        showFeedback(successMsg, 'success');
        form.reset();
        clearFile();
        typePills.forEach(function (p) { p.classList.remove('active'); });
        var bugPill = form.querySelector('[data-type="bug"]');
        if (bugPill) bugPill.classList.add('active');
        selectedType = 'bug';
      })
      .catch(function (err) {
        var errMsg = (err && err.message && err.message !== 'HTTP 400')
          ? err.message
          : msg('error');
        showFeedback(errMsg, 'error');
      })
      .finally(function () {
        // Single-use token: resetting only on success (where this used to live) left
        // a spent token in the widget after any failure, so every retry was rejected.
        // Same fix as contact-form.js.
        if (window.turnstile && turnstileWidgetId !== null) {
          window.turnstile.reset(turnstileWidgetId);
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          // Restore original button content (icon + text) from cloned nodes
          submitBtn.textContent = '';
          for (var i = 0; i < submitBtnOriginalChildren.length; i++) {
            submitBtn.appendChild(submitBtnOriginalChildren[i].cloneNode(true));
          }
          if (window.lucide) window.lucide.createIcons();
        }
      });
  });

  // ── Feedback UI ─────────────────────────────────────────────────────
  function showFeedback(text, type) {
    if (!feedback) return;
    feedback.textContent = text;
    feedback.className = 'form-feedback ' + type;
    feedback.hidden = false;
  }

  function hideFeedback() {
    if (!feedback) return;
    feedback.hidden = true;
    feedback.className = 'form-feedback';
  }
})();
