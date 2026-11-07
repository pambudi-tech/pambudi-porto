import { RESUME, hasPass, resumeFile, send } from '../server/works-pass.mjs';

// GET: the resume PDF as a download, for a visitor with a pass (the same PIN
// as protected work). About Me asks for the PIN first (src/paper/about-resume-pin.mjs).
export default async function handler(request, response) {
  if (!hasPass(request)) return send(response, 401, { error: 'pass' });
  const body = await resumeFile();
  if (!body) return send(response, 404, { error: 'resume' });
  send(response, 200, body, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${RESUME.name}"` });
}
