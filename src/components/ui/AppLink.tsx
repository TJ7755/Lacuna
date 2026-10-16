import { forwardRef } from 'react';
import {
  Link,
  useHref,
  useLinkClickHandler,
  useLocation,
  useResolvedPath,
  type LinkProps,
  type NavLinkProps,
} from 'react-router-dom';

/** App navigation has link semantics without the browser's hover destination overlay. */
export const AppLink = forwardRef<HTMLAnchorElement, LinkProps>(function AppLink(
  {
    to,
    replace,
    state,
    relative,
    preventScrollReset,
    viewTransition,
    reloadDocument,
    target,
    download,
    className,
    onClick,
    onAuxClick,
    onKeyDown,
    tabIndex = 0,
    ...props
  },
  ref,
) {
  const href = useHref(to, { relative });
  const navigate = useLinkClickHandler(to, {
    replace,
    state,
    relative,
    preventScrollReset,
    viewTransition,
    target,
  });
  if (
    reloadDocument ||
    target ||
    download ||
    (typeof to === 'string' && /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(to))
  ) {
    return (
      <Link
        {...props}
        className={className}
        ref={ref}
        to={to}
        replace={replace}
        state={state}
        relative={relative}
        preventScrollReset={preventScrollReset}
        viewTransition={viewTransition}
        reloadDocument={reloadDocument}
        target={target}
        download={download}
        onClick={onClick}
        onAuxClick={onAuxClick}
        onKeyDown={onKeyDown}
        tabIndex={tabIndex}
      />
    );
  }
  return (
    <a
      {...props}
      className={`cursor-pointer ${className ?? ''}`}
      ref={ref}
      role="link"
      tabIndex={tabIndex}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey) {
          event.preventDefault();
          window.open(href, '_blank', 'noopener,noreferrer');
        } else navigate(event);
      }}
      onAuxClick={(event) => {
        onAuxClick?.(event);
        if (!event.defaultPrevented && event.button === 1) {
          event.preventDefault();
          window.open(href, '_blank', 'noopener,noreferrer');
        }
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (!event.defaultPrevented && event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.dispatchEvent(
            new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              ctrlKey: event.ctrlKey,
              metaKey: event.metaKey,
              shiftKey: event.shiftKey,
              altKey: event.altKey,
            }),
          );
        }
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
