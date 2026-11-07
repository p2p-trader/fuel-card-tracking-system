/**
 * Code.gs — web app entry point.
 * Serves the single-page app, or the read-only JSON API when ?api= is present.
 */

function doGet(e) {
  if (e && e.parameter && e.parameter.api) {
    return handleApiRequest(e);
  }
  var html = HtmlService.createTemplateFromFile('Index').evaluate();
  html.setTitle('Fuel Card Tracking System');
  html.addMetaTag('viewport', 'width=device-width, initial-scale=1');
  html.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return html;
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
