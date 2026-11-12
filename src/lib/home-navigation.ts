interface RouteLocation { pathname: string; state?: { backgroundPath?: string } | null }
function background(location: RouteLocation) {
  if (location.pathname.startsWith('/glyphs/')) return '/glyphs';
  return location.pathname.startsWith('/cards/') ? location.state?.backgroundPath ?? '/' : location.pathname === '/menu' ? '/' : location.pathname;
}
export function isHomeReturn(previous: RouteLocation, next: RouteLocation): boolean {
  return background(next) === '/' && background(previous) !== '/';
}
