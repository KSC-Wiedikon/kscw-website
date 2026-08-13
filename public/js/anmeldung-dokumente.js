/**
 * KSCW — Late document re-upload ("Dokumente nachreichen")
 *
 * Recovery path for registrations whose document uploads failed after the
 * registration was created (e.g. REG-2026-5041), and for completing docs on
 * pending/approved rows before the admin can approve them. Auth = reference
 * number + registration email together (both come from the confirmation
 * email); the backend rate-limits and locks out brute-force attempts.
 *
 * Flow: GET /kscw/registration/doc-status → render missing slots → upload
 * picked files to POST /files → link via POST /kscw/registration/:id/files.
 */
(function () {
  'use strict';

  var DIRECTUS_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'https://directus-dev.kscw.ch' : 'https://directus.kscw.ch';

  var form = document.getElementById('docstatus-form');
  var feedback = document.getElementById('docs-feedback');
  var slotsBox = document.getElementById('docs-slots');
  var checkBtn = document.getElementById('docs-check-btn');
  var locale = document.documentElement.lang || 'de';
  var de = locale === 'de';

  if (!form) return;

  var LABELS = {
    id_upload_front: de ? 'ID / Pass — Vorderseite' : 'ID / passport — front',
    id_upload_back: de ? 'ID / Pass — Rückseite' : 'ID / passport — back',
    bb_doc_lizenz: de ? 'Lizenzantrag (unterschrieben)' : 'Licence application (signed)',
    bb_doc_freibrief: de ? 'Freibrief (unterschrieben)' : 'Release letter / Freibrief (signed)',
    bb_doc_selfdecl: "Player's Self Declaration",
    bb_doc_natdecl: 'Acknowledgment of National Team Restriction',
    bb_doc_u18parents: de ? 'Einverständnis der Eltern (U18)' : 'Parental consent (U18)',
    bb_doc_schoolcert: de ? 'Schulbestätigung (optional)' : 'School enrolment certificate (optional)',
  };
  var ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  var MAX_FILE_SIZE = 10 * 1024 * 1024;

  var current = null; // { id, reference, email, required, docs }

  function showFeedback(kind, msg) {
    feedback.style.display = 'block';
    feedback.textContent = msg;
    feedback.style.padding = '12px 16px';
    feedback.style.borderRadius = '8px';
    // Tinted-background + token-colour pair, matching .badge-success/.badge-danger
    // in global.css. The previous hardcoded #fef2f2/#f0fdf4 boxes were light-theme
    // literals painted onto a dark-by-default page.
    feedback.style.background = kind === 'error' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(5, 150, 105, 0.1)';
    feedback.style.color = kind === 'error' ? 'var(--danger)' : 'var(--success)';
    feedback.style.border = '1px solid ' + (kind === 'error' ? 'rgba(220, 38, 38, 0.3)' : 'rgba(5, 150, 105, 0.3)');
  }
  function hideFeedback() { feedback.style.display = 'none'; }

  function validateFile(file) {
    if (ALLOWED_TYPES.indexOf(file.type) === -1) {
      throw new Error(de ? 'Ungültiger Dateityp. Erlaubt: JPG, PNG, WebP, PDF.' : 'Invalid file type. Allowed: JPG, PNG, WebP, PDF.');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(de ? 'Datei zu gross (max. 10 MB).' : 'File too large (max 10 MB).');
    }
  }

  function uploadSingleFile(file) {
    // Same private-folder upload endpoint as the registration form — the file
    // is born inside the private registration folder, never anon-readable.
    return fetch(DIRECTUS_URL + '/kscw/registration/upload?filename=' + encodeURIComponent(file.name || 'document'), {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    })
      .then(function (r) {
        if (!r.ok) throw new Error(de ? 'Upload fehlgeschlagen.' : 'Upload failed.');
        return r.json();
      })
      .then(function (data) { return data.id; });
  }

  function renderSlots() {
    slotsBox.innerHTML = '';
    slotsBox.style.display = 'block';

    var allKeys = Object.keys(LABELS);
    var missingRequired = current.required.filter(function (k) { return !current.docs[k]; });

    if (!missingRequired.length) {
      showFeedback('ok', de
        ? 'Alle erforderlichen Dokumente sind vorhanden — vielen Dank!'
        : 'All required documents are on file — thank you!');
      return;
    }

    var head = document.createElement('p');
    head.style.fontWeight = '600';
    head.style.marginBottom = '12px';
    head.textContent = de ? 'Folgende Dokumente fehlen noch:' : 'The following documents are still missing:';
    slotsBox.appendChild(head);

    allKeys.forEach(function (key) {
      if (current.required.indexOf(key) === -1) return;
      var row = document.createElement('div');
      row.style.marginBottom = '16px';
      var label = document.createElement('label');
      label.style.display = 'block';
      label.style.fontWeight = '600';
      label.style.marginBottom = '4px';
      label.textContent = LABELS[key] + (current.docs[key] ? ' ✓' : ' *');
      row.appendChild(label);
      if (current.docs[key]) {
        var ok = document.createElement('small');
        ok.style.color = 'var(--success)';
        ok.textContent = de ? 'Bereits vorhanden' : 'Already on file';
        row.appendChild(ok);
      } else {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,.pdf';
        // Global class, not a page-scoped one — Astro scopes <style> by stamping
        // an attribute on build-time nodes, and this input is created here.
        input.className = 'form-input';
        input.dataset.docKey = key;
        row.appendChild(input);
      }
      slotsBox.appendChild(row);
    });

    var submit = document.createElement('button');
    submit.type = 'button';
    // `.form-submit` is NOT a site-wide class — kontakt / anmeldung / feedback
    // each define their own copy inside a scoped <style>, so it renders as bare
    // unstyled text anywhere else (same trap global.css records for .btn-blue).
    submit.className = 'btn btn-primary';
    submit.textContent = de ? 'Dokumente hochladen' : 'Upload documents';
    submit.addEventListener('click', function () { uploadMissing(submit); });
    slotsBox.appendChild(submit);
  }

  function uploadMissing(btn) {
    hideFeedback();
    var inputs = slotsBox.querySelectorAll('input[type="file"]');
    var picked = [];
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].files.length) picked.push(inputs[i]);
    }
    if (!picked.length) {
      return showFeedback('error', de ? 'Bitte wähle mindestens eine Datei aus.' : 'Please pick at least one file.');
    }
    try {
      for (var v = 0; v < picked.length; v++) validateFile(picked[v].files[0]);
    } catch (e) {
      return showFeedback('error', e.message);
    }

    btn.disabled = true;
    btn.textContent = de ? 'Wird hochgeladen…' : 'Uploading…';

    Promise.all(picked.map(function (inp) { return uploadSingleFile(inp.files[0]); }))
      .then(function (ids) {
        var body = { reference_number: current.reference, email: current.email };
        for (var k = 0; k < picked.length; k++) body[picked[k].dataset.docKey] = ids[k];
        return fetch(DIRECTUS_URL + '/kscw/registration/' + current.id + '/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      })
      .then(function (r) {
        if (!r.ok) throw new Error(de ? 'Übermittlung fehlgeschlagen — bitte später erneut versuchen.' : 'Submission failed — please try again later.');
        // Re-render slots with fresh state; keep a success message visible even
        // when only part of the documents was submitted (check() hides feedback,
        // and its complete-case re-shows its own "all on file" confirmation).
        return check().then(function () {
          var stillMissing = current && current.required.some(function (k) { return !current.docs[k]; });
          if (stillMissing) {
            showFeedback('ok', de
              ? 'Dokumente übermittelt — es fehlen noch weitere Dokumente (siehe unten).'
              : 'Documents submitted — some documents are still missing (see below).');
          }
        });
      })
      .catch(function (err) {
        showFeedback('error', err && err.message ? err.message : (de ? 'Fehler beim Hochladen.' : 'Upload error.'));
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = de ? 'Dokumente hochladen' : 'Upload documents';
      });
  }

  function check() {
    var reference = (document.getElementById('docs-ref').value || '').trim();
    var email = (document.getElementById('docs-email').value || '').trim();
    if (!reference || !email) return Promise.resolve();
    checkBtn.disabled = true;
    return fetch(DIRECTUS_URL + '/kscw/registration/doc-status?reference=' + encodeURIComponent(reference) + '&email=' + encodeURIComponent(email))
      .then(function (r) {
        if (r.status === 429) throw new Error(de ? 'Zu viele Versuche — bitte in 10 Minuten erneut versuchen.' : 'Too many attempts — please try again in 10 minutes.');
        if (!r.ok) throw new Error(de ? 'Keine Anmeldung gefunden — bitte Referenznummer und E-Mail prüfen.' : 'No registration found — please check the reference number and email.');
        return r.json();
      })
      .then(function (data) {
        hideFeedback();
        if (data.membership_type !== 'basketball' || !data.required.length) {
          slotsBox.style.display = 'none';
          return showFeedback('ok', de
            ? 'Für diese Anmeldung sind keine Dokumente erforderlich.'
            : 'No documents are required for this registration.');
        }
        current = { id: data.id, reference: data.reference_number, email: email, required: data.required, docs: data.docs };
        renderSlots();
      })
      .catch(function (err) {
        slotsBox.style.display = 'none';
        showFeedback('error', err && err.message ? err.message : 'Error');
      })
      .finally(function () { checkBtn.disabled = false; });
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    hideFeedback();
    check();
  });

  // Prefill from query params (?ref=REG-2026-1234&email=...) so the link in an
  // email or from the admin lands ready to check.
  try {
    var params = new URLSearchParams(window.location.search);
    var qRef = params.get('ref');
    var qEmail = params.get('email');
    if (qRef) document.getElementById('docs-ref').value = qRef;
    if (qEmail) document.getElementById('docs-email').value = qEmail;
    if (qRef && qEmail) check();
  } catch (_) { /* noop */ }
})();
