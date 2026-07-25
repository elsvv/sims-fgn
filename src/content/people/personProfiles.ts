import type { PersonProfile } from '../../sim/social/Romance'
import { TEACHERS } from './teachers'

/**
 * Кто есть кто и с кем вообще возможна романтическая линия.
 *
 * Правило одно и оно жёсткое: романтические ветки допустимы только для
 * вымышленных однокурсников. Преподаватели — реальные люди под настоящими
 * именами, у них `romanceable: false`, и это не редактируется «на глазок»:
 * профили преподавателей выводятся прямо из каталога TEACHERS, так что
 * новый преподаватель автоматически появляется здесь запрещённым.
 *
 * Проверку выполняет validateProfiles из sim/social/Romance.ts, см.
 * personProfiles.test.ts.
 */
const TEACHER_PROFILES: Record<string, PersonProfile> = Object.fromEntries(
  Object.values(TEACHERS).map((teacher) => [
    teacher.id,
    {
      id: teacher.id,
      name: teacher.name,
      kind: 'teacher',
      fictional: false,
      romanceable: false,
    } satisfies PersonProfile,
  ]),
)

/**
 * Однокурсники — выдуманные целиком, с выдуманными именами.
 * Архетипы взяты из дизайн-документа, §7.3.
 */
const CLASSMATE_PROFILES: Record<string, PersonProfile> = {
  // Та, кто прочитала всё и молчит.
  vera: {
    id: 'vera',
    name: 'Вера Соломина',
    kind: 'classmate',
    fictional: true,
    romanceable: true,
  },
  // Тот, кто не прочитал ничего и говорит лучше всех.
  kirill: {
    id: 'kirill',
    name: 'Кирилл Ждан',
    kind: 'classmate',
    fictional: true,
    romanceable: true,
  },
  // Организатор, который знает все дедлайны. Романтической линии у него нет:
  // разрешение ставится вручную и по одному, а не «всем однокурсникам сразу».
  marta: {
    id: 'marta',
    name: 'Марта Ковригина',
    kind: 'classmate',
    fictional: true,
    romanceable: false,
  },
}

export const PERSON_PROFILES: Record<string, PersonProfile> = {
  ...TEACHER_PROFILES,
  ...CLASSMATE_PROFILES,
}
