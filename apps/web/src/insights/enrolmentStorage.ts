/** Shared storage identity; validation stays in the optional enrolment module. */
export function enrolmentStorageOptions(courseId: string) {
  return {
    key: `lacuna.insights.enrolment.${courseId}`,
    event: `lacuna:insights-enrolment-${courseId}`,
  };
}
