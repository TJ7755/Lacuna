import { Navigate, useParams } from 'react-router-dom';

/** Preserve old bookmarks while keeping Card terminology out of the current UI. */
export function LegacyBankRedirect() {
  const { courseId } = useParams<{ courseId: string }>();
  return <Navigate to={courseId ? `/course/${courseId}/cards` : '/'} replace />;
}
