import type { LectureStatus } from './content/types';

export function lectureStatus(lecture: { status?: LectureStatus }): LectureStatus {
  return lecture.status ?? 'unknown';
}

export function lectureStatusLabel(status: LectureStatus): string {
  return { ready: 'Připraveno', 'in-progress': 'Rozpracováno', 'not-started': 'Nezahájeno', unknown: 'Stav neznámý' }[status];
}
