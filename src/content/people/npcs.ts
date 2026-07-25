import type { NpcSpec } from '../../sim/npc/Npc'
import { TEACHERS } from './teachers'

/**
 * Где преподаватель проводит время между парами.
 *
 * Настоящее место — преподавательская, но она на третьем этаже, а он ещё
 * не построен. Поэтому пятеро ждут своей пары в коридоре второго этажа,
 * как это и бывает перед аудиториями. Павлов на первом курсе не
 * преподаёт (см. teachers.ts) и на пары не ходит вовсе — он стоит
 * в лифтовом холле: человек, который зашёл на этаж по своим делам.
 * Заодно это единственный способ встретить его в игре.
 */
const HOME_ROOMS: Record<string, string> = {
  pavlov: 'лифтовый холл',
}

const DEFAULT_HOME_ROOM = 'коридор'

/**
 * Шесть преподавателей как жители этажа.
 *
 * Список выводится из каталога TEACHERS, а не пишется руками: новый
 * преподаватель в каталоге автоматически становится человеком в игре,
 * и разойтись эти два списка не могут.
 */
export const TEACHER_NPCS: NpcSpec[] = Object.values(TEACHERS).map((teacher) => ({
  id: `teacher-${teacher.id}`,
  teacherId: teacher.id,
  courseIds: teacher.courseIds,
  homeRoom: HOME_ROOMS[teacher.id] ?? DEFAULT_HOME_ROOM,
}))
