// The id in a project page's address, /work/<id>. On its own, so the
// homepage can read its address before it has loaded every work's content.
export const projectId = pathname => pathname.match(/^\/work\/([^/]+)\/?$/)?.[1] ?? null;
// The resume, open over the cloth (src/resume/resume-view.mjs).
export const resumeAt = pathname => /^\/resume\/?$/.test(pathname);
