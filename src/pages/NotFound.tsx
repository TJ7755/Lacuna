import { Link } from 'react-router-dom';
import { UI } from '../ui-strings';

export function NotFound() {
  return (
    <main style={{ padding: '2rem' }}>
      <h1>{UI.common.notFound}</h1>
      <Link to="/">{UI.common.backToHome}</Link>
    </main>
  );
}
