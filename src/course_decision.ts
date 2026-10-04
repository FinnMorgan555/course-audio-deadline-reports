export type CourseDelivery = {
  courseId: string;
  learnerId: string;
  deadline: string;
  deliveredAt: string;
};

export function reportDelivery(delivery: CourseDelivery, transcript: string) {
  const onTime = Date.parse(delivery.deliveredAt) <= Date.parse(delivery.deadline);
  return {
    courseId: delivery.courseId,
    learnerId: delivery.learnerId,
    transcript,
    status: onTime ? "on_time" as const : "late" as const,
    educatorReport: `${delivery.learnerId} submitted ${delivery.courseId} ${onTime ? "on time" : "after the deadline"}.`,
  };
}
