const ROUTE_BODY: Record<string, string> = {
  '/': 'landing',
  '/connect': 'landing',
  '/login': 'brand',
  '/quizzes': 'brand',
  '/builder': 'brand',
  '/player': 'brand',
  '/host': 'host brand',
  '/preview-host': 'host brand host-quiz-viewing preview-host',
};

const PRESERVE_ALWAYS = ['preview-fullscreen'];
const HOST_PATHS = new Set(['/host', '/preview-host']);

export function applyBodyClassForPath(pathname: string) {
  const preserved = PRESERVE_ALWAYS.filter((c) => document.body.classList.contains(c));
  if (HOST_PATHS.has(pathname) && document.body.classList.contains('host-quiz-viewing')) {
    preserved.push('host-quiz-viewing');
  }
  const base = ROUTE_BODY[pathname] ?? 'brand';
  document.body.className = [base, ...preserved].filter(Boolean).join(' ');
}
