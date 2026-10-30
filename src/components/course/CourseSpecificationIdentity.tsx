import type { CourseDistributedCopy, CourseRecord } from '../../db/types';
import { libraryCourses } from '../../library/catalogue';

export const specificationBoardNames = {
  aqa: 'AQA',
  'pearson-edexcel': 'Pearson Edexcel',
  ocr: 'OCR',
  cambridge: 'Cambridge',
};

export const specificationQualificationNames = {
  gcse: 'GCSE',
  'international-gcse': 'International GCSE',
  'cambridge-igcse-9-1': 'Cambridge IGCSE (9–1)',
  fsmq: 'FSMQ',
};

export type CourseIdentity = Pick<
  CourseRecord,
  'examBoard' | 'specification' | 'specificationData' | 'specificationRef'
>;
type Publication = Pick<CourseDistributedCopy, 'lineageId' | 'revision'>;

export function libraryPublication(publication?: Publication) {
  return publication
    ? libraryCourses.find(
        (course) =>
          course.publication?.lineageId === publication.lineageId &&
          course.revision === publication.revision,
      )
    : undefined;
}

/** Catalogue identity supplements display only; it never assigns a syllabus to course content. */
export function CourseSpecificationIdentity({
  course,
  publication,
}: {
  course: CourseIdentity;
  publication?: Publication;
}) {
  const spec = course.specificationData;
  const reference = course.specificationRef;
  const published = libraryPublication(publication);
  const catalogue =
    !spec &&
    !reference &&
    (!course.examBoard || course.examBoard === published?.board) &&
    (!course.specification || course.specification === published?.code)
      ? published
      : undefined;
  const facts = catalogue?.publication;
  const board = spec
    ? specificationBoardNames[spec.board]
    : course.examBoard || catalogue?.board || 'Not supplied';
  const code =
    spec?.code ||
    course.specification ||
    reference?.specificationId ||
    catalogue?.code ||
    'Not supplied';
  const tier = spec?.tiers.find(({ id }) => id === reference?.tier)?.name;
  const routes = reference?.routeIds?.map(
    (id) => spec?.routes.find((route) => route.id === id)?.name ?? `Unverified (${id})`,
  );
  const sourceUrl = facts?.specificationUrl;

  return (
    <section
      aria-label="Course identity"
      className="mb-4 flex flex-col gap-2 text-sm text-ink-soft"
    >
      <dl className="grid gap-2 sm:grid-cols-2">
        {[
          ['Exam board', board],
          ['Specification', code],
          [
            'Qualification',
            spec ? specificationQualificationNames[spec.qualification] : catalogue?.qualification,
          ],
          ['Route', spec || reference ? routes?.join(', ') || 'Not supplied' : facts?.route],
          ['Publisher tier target', facts?.tierTarget],
          [
            'Selected tier',
            spec
              ? (tier ?? (reference?.tier ? `Unverified (${reference.tier})` : 'Not chosen'))
              : undefined,
          ],
        ].map(([label, value]) =>
          value ? (
            <div key={label}>
              <dt className="font-medium text-ink">{label}</dt>
              <dd>{value}</dd>
            </div>
          ) : null,
        )}
      </dl>
      {facts ? (
        <>
          <p>Library catalogue details for revision {catalogue?.revision}.</p>
          <p>
            Course tier eligibility is unverified. The publisher’s target does not confirm Higher
            suitability.
          </p>
        </>
      ) : !spec ? (
        <p>Tier and route are unverified: no specification metadata supplied.</p>
      ) : (
        <p>Course-supplied specification; content eligibility is not independently verified.</p>
      )}
      {sourceUrl && (
        <a href={sourceUrl} target="_blank" rel="noreferrer" className="underline">
          Awarding body specification
        </a>
      )}
    </section>
  );
}
