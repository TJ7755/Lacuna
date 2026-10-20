import { renderToReadableStream, renderToStaticMarkup } from 'react-dom/server';
import { CoursePage } from './CoursePage';
import { courseForPath, courseMetadata } from './content';

export async function render(path: string) {
  const stream = await renderToReadableStream(<CoursePage course={courseForPath(path)} />);
  return new Response(stream).text();
}

export function renderHead(path: string) {
  const course = courseForPath(path);
  const { title, ogTitle, description, canonical } = courseMetadata(course);
  return renderToStaticMarkup(
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={ogTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta name="twitter:card" content="summary" />
      {course && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Course',
              name: `${course.subject} ${course.code}`,
              description: course.summary,
              url: canonical,
              inLanguage: 'en-GB',
              isAccessibleForFree: true,
              educationalLevel: course.qualification,
              provider: { '@type': 'Organization', name: 'Lacuna', url: 'https://getlacuna.app/' },
            }).replaceAll('<', '\\u003c'),
          }}
        />
      )}
    </>,
  );
}
