import { forwardRef, useContext } from 'react';
import { RoutePrefetchContext } from '../../routes/RoutePrefetchContext';
import {
  Link,
  useLocation,
  useResolvedPath,
  type LinkProps,
  type NavLinkProps,
} from 'react-router-dom';

/** Native links retain browser actions while internal destinations warm on intent. */
export const AppLink = forwardRef<HTMLAnchorElement, LinkProps>(function AppLink(
  { to, relative, onFocus, onPointerEnter, onPointerDown, ...props },
  ref,
) {
  const prefetchRoute = useContext(RoutePrefetchContext);
  const resolved = useResolvedPath(to, { relative });
  const internal =
    !props.reloadDocument &&
    !props.target &&
    !props.download &&
    !(typeof to === 'string' && /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(to));
  return (
    <Link
      {...props}
      ref={ref}
      to={to}
      relative={relative}
      onFocus={(event) => {
        onFocus?.(event);
        if (internal && !event.defaultPrevented) prefetchRoute(resolved.pathname);
      }}
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
        if (internal && !event.defaultPrevented) prefetchRoute(resolved.pathname);
      }}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        if (internal && !event.defaultPrevented && event.button === 0)
          prefetchRoute(resolved.pathname);
      }}
    />
  );
});

export const AppNavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(function AppNavLink(
  { to, end = false, caseSensitive = false, className, style, children, ...props },
  ref,
) {
  const resolved = useResolvedPath(to, { relative: props.relative });
  const location = useLocation();
  const pathname = caseSensitive ? location.pathname : location.pathname.toLowerCase();
  const destination = caseSensitive ? resolved.pathname : resolved.pathname.toLowerCase();
  const boundary = destination.endsWith('/') ? destination.length - 1 : destination.length;
  const isActive =
    pathname === destination ||
    (!end && pathname.startsWith(destination) && pathname.charAt(boundary) === '/');
  const status = { isActive, isPending: false, isTransitioning: false };
  return (
    <AppLink
      {...props}
      ref={ref}
      to={to}
      aria-current={isActive ? (props['aria-current'] ?? 'page') : undefined}
      className={typeof className === 'function' ? className(status) : className}
      style={typeof style === 'function' ? style(status) : style}
    >
      {typeof children === 'function' ? children(status) : children}
    </AppLink>
  );
});
