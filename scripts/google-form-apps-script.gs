/**
 * Beyond Style UAE — Google Form → confirmation webhook bridge.
 *
 * Google Forms have no native webhook, so this Apps Script forwards each
 * submission to POST /api/webhook/form-intake. The webhook validates the data,
 * extracts the customer's number, and sends the WhatsApp confirmation request.
 *
 * SETUP
 * 1. Open the Form (or its linked responses Sheet) → Extensions → Apps Script.
 * 2. Paste this file. Set the two Script Properties below:
 *      Project Settings → Script properties:
 *        WEBHOOK_URL    = https://<your-vercel-app>/api/webhook/form-intake
 *        WEBHOOK_SECRET = <same value as the app's WEBHOOK_SECRET>  (optional)
 * 3. Triggers (clock icon) → Add Trigger:
 *        function: onFormSubmit, event source: From form, type: On form submit.
 * 4. Authorize when prompted. Test with a real submission.
 *
 * The field titles below map the Form's question titles to the webhook keys.
 * Adjust the right-hand strings to match your Form's exact question text.
 */

var FIELD_MAP = {
  'Full Name': 'Full Name',
  'Mobile Number': 'Mobile Number',
  'WhatsApp Number if different': 'WhatsApp Number if different',
  'Email': 'Email',
  'Emirate': 'Emirate',
  'Area': 'Area',
  'Full Address': 'Full Address',
  'Google Maps Location': 'Google Maps Location',
  'Preferred Delivery Time': 'Preferred Delivery Time',
  'Payment Method': 'Payment Method',
  'Order Summary Confirmation': 'Order Summary Confirmation',
  'Special Delivery Notes': 'Special Delivery Notes',
  'Source Platform': 'Source Platform',
  'Instagram Username': 'Instagram Username'
};

function onFormSubmit(e) {
  var payload = {};

  // Prefer the structured itemResponses (form trigger); fall back to namedValues.
  if (e && e.response && e.response.getItemResponses) {
    var items = e.response.getItemResponses();
    for (var i = 0; i < items.length; i++) {
      var title = items[i].getItem().getTitle();
      var key = FIELD_MAP[title] || title;
      payload[key] = items[i].getResponse();
    }
  } else if (e && e.namedValues) {
    for (var name in e.namedValues) {
      var v = e.namedValues[name];
      payload[FIELD_MAP[name] || name] = Array.isArray(v) ? v.join(', ') : v;
    }
  }

  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('WEBHOOK_URL');
  var secret = props.getProperty('WEBHOOK_SECRET');
  if (!url) {
    Logger.log('WEBHOOK_URL script property is not set.');
    return;
  }

  var headers = { 'Content-Type': 'application/json' };
  if (secret) headers['x-webhook-secret'] = secret;

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    var res = UrlFetchApp.fetch(url, options);
    Logger.log('Webhook %s -> %s', res.getResponseCode(), res.getContentText());
  } catch (err) {
    Logger.log('Webhook call failed: %s', err);
  }
}
