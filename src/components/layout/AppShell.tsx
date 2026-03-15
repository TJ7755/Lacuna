import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useSettingsStore } from '../../store/settings';
import { UI } from '../../ui-strings';
import styles from './AppShell.module.css';

export function AppShell() {
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
  }, [theme]);

  const getLinkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink;

  return (
    <div className={styles.shell}>
      <nav className={styles.nav} aria-label={UI.layout.nav}>
        <ul className={styles.navList}>
          <li>
            <NavLink to="/" end className={getLinkClass}>
              {UI.nav.home}
            </NavLink>
          </li>
          <li>
            <NavLink to="/decks" className={getLinkClass}>
              {UI.nav.decks}
            </NavLink>
          </li>
          <li>
            <NavLink to="/review" className={getLinkClass}>
              {UI.nav.review}
            </NavLink>
          </li>
          <li>
            <NavLink to="/notes" className={getLinkClass}>
              {UI.nav.notes}
            </NavLink>
          </li>
          <li>
            <NavLink to="/settings" className={getLinkClass}>
              {UI.nav.settings}
            </NavLink>
          </li>
        </ul>
      </nav>
      <div className={styles.content}>
        <Outlet />
      </div>
    </div>
  );
}
