// Prints tools/resume/resume.html to private/resume/ivan-pambudi-resume.pdf
// (served only to PIN pass holders by api/resume.js)
// with headless Chrome, so the PDF keeps real, selectable text for ATS parsers.
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const source = fileURLToPath(new URL('./resume.html', import.meta.url));
const output = fileURLToPath(new URL('../../private/resume/ivan-pambudi-resume.pdf', import.meta.url));

execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${output}`, pathToFileURL(source).href], { stdio: 'inherit' });
console.log(`wrote ${output}`);
