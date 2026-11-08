import { RESUME, hasPass, resumeFile, send } from '../server/works-pass.mjs';

// GET: the resume PDF, for a visitor with a pass (the same PIN as protected
// work). The homepage's resume view (src/resume/resume-view.mjs) asks for the
// PIN first and draws it; the header names the file for anyone saving it.
export default async function handler(request, response) {
  if (!hasPass(request)) return send(response, 401, { error: 'pass' });
  const body = await resumeFile();
  if (!body) return send(response, 404, { error: 'resume' });
  send(response, 200, body, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${RESUME.name}"` });
}
