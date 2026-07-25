import type { CharacterAppearance } from '../../shared/appearance'
import type { MaterialRole, PartSlot } from '../../shared/characterModel'

/**
 * Правила сборки человека из моделей набора — та часть, где нет ни three,
 * ни react, и которую поэтому можно проверить тестом.
 *
 * Здесь решается, что каким цветом красить и во сколько раз масштабировать.
 * Сама пересадка частей и создание объектов — в GltfCharacter.tsx.
 */

/** Обувь во внешности не описана: у всех одинаковая тёмная, как и у капсульного. */
export const SHOE_COLOR = '#2b3038'

/** Оправа очков. Тот же цвет, что у капсульного человечка. */
export const GLASSES_COLOR = '#15181d'

/**
 * Рост моделей набора в метрах. Все двадцать одна модель одного роста —
 * это и есть та проблема, ради которой существует масштабирование.
 */
export const MODEL_HEIGHT = 1.81

/** Границы, в которых измеренный рост модели считается правдоподобным. */
const SANE_HEIGHT = { min: 1.4, max: 2.4 }

/**
 * Часть тела по имени узла: `Casual2_Head` → `Head`.
 *
 * У `women/Formal` голова названа `Formad_Head` — с опечаткой автора.
 * Правило смотрит на суффикс, поэтому опечатка ему безразлична.
 * Узлы вне частей тела (рюкзак `Backpack`, оружие `Pistol`) не относятся
 * ни к чему и остаются как есть.
 */
export function partSlotOf(nodeName: string): PartSlot | null {
  const match = /_(Head|Body|Legs|Feet|Pants)$/.exec(nodeName)
  if (!match) return null
  return match[1] as PartSlot
}

/** Материалы кожи. Единственные, что зовутся по смыслу во всех файлах набора. */
export function isSkinMaterial(name: string): boolean {
  return name.startsWith('Skin')
}

/** Во что превращается главный материал части тела. */
export function clothingRole(slot: PartSlot): MaterialRole {
  switch (slot) {
    case 'Head':
      return 'hair'
    case 'Body':
      return 'top'
    case 'Legs':
    case 'Pants':
      return 'bottom'
    case 'Feet':
      return 'shoes'
  }
}

export interface SlotMaterial {
  /** Имя материала, как оно записано в файле. */
  material: string
  /** Сколько треугольников на него приходится внутри этой части тела. */
  triangles: number
}

/**
 * Кто есть кто среди материалов одной части тела.
 *
 * Правило подсмотрено у обстановки (`dominantMaterial` в
 * building/propModelParts.ts) и работает по той же причине: у модели
 * набора один материал занимает почти всю поверхность части, а остальные —
 * мелочи. Перекрашивать надо главный, а мелочи оставлять: иначе костюм
 * Михайловского становится одноцветным пятном без рубашки и галстука,
 * а у Алиевой пропадают тёмные брови — все сорок треугольников бровей
 * заливаются цветом волос.
 *
 * Кожа выведена из голосования: у `women/Formal` на ноги приходится
 * 348 треугольников кожи против 134 треугольников платья, и главным
 * материалом штанов оказалась бы голень.
 *
 * Узлы вне частей тела не красятся вовсе: рюкзак игрока — не одежда,
 * и заливать его цветом куртки нечего.
 */
export function rolesInSlot(
  slot: PartSlot | null,
  materials: readonly SlotMaterial[],
  overrides: Readonly<Record<string, MaterialRole>> = {},
): Map<string, MaterialRole> {
  const roles = new Map<string, MaterialRole>()
  if (slot === null) {
    for (const entry of materials) roles.set(entry.material, 'keep')
    return roles
  }

  let dominant: SlotMaterial | null = null
  for (const entry of materials) {
    if (isSkinMaterial(entry.material)) {
      roles.set(entry.material, 'skin')
      continue
    }
    const override = overrides[entry.material]
    if (override) {
      roles.set(entry.material, override)
      continue
    }
    roles.set(entry.material, 'keep')
    if (!dominant || entry.triangles > dominant.triangles) dominant = entry
  }

  if (dominant) roles.set(dominant.material, clothingRole(slot))
  return roles
}

/**
 * Цвет для роли. `null` значит «оставить как в файле» — так сохраняются
 * глаза, брови и всё, чего внешность не описывает.
 */
export function colorForRole(
  role: MaterialRole,
  appearance: CharacterAppearance,
): string | null {
  switch (role) {
    case 'skin':
      return appearance.skin
    case 'hair':
      return appearance.hair
    case 'top':
      return appearance.top
    case 'bottom':
      return appearance.bottom
    case 'shoes':
      return SHOE_COLOR
    case 'keep':
      return null
  }
}

/**
 * Во сколько раз ужать или растянуть модель, чтобы её макушка пришлась
 * на заявленный рост.
 *
 * Масштаб тянет и голову: набор не даёт другого способа развести рост,
 * все модели в нём одинаковые. При разбросе от 1,63 до 1,83 это
 * десять процентов, и голова у самой низкой меньше на те же десять —
 * незаметно. Заметно стало бы на «низкий и высокий», и вот этого
 * набором не сделать (docs/known-issues.md).
 *
 * Измеренный рост берётся у собранной фигуры, а не из константы:
 * донорская голова может оказаться выше базовой. Если измерение
 * пришло бессмысленное — файл пуст, габарит вывернут, — берётся
 * известный рост набора, и человек остаётся человеком.
 */
export function heightScale(measuredHeight: number, targetHeight: number): number {
  const sane =
    Number.isFinite(measuredHeight) &&
    measuredHeight >= SANE_HEIGHT.min &&
    measuredHeight <= SANE_HEIGHT.max
  return targetHeight / (sane ? measuredHeight : MODEL_HEIGHT)
}

/**
 * С какой скоростью человек идёт в клипе `Walk`, если его не ускорять.
 *
 * Измерено по клипу: ступня за цикл проходит 0.88 м вперёд-назад, цикл
 * длится 1.333 с и содержит два шага. Симуляция при этом двигает актора
 * с постоянной скоростью 1.4 м/с — цифры сошлись почти сами, набор
 * рисовали под ту же человеческую походку.
 */
export const WALK_CLIP_SPEED_MPS = 1.32

/**
 * Во сколько раз ускорить клип ходьбы.
 *
 * Иначе ноги скользят: клип шагает всегда одинаково, а масштаб фигуры
 * укорачивает шаг вместе с ногами. У Алиевой при росте 1.63 шаг короче
 * на десятую, и без поправки она ехала бы вперёд на выпрямленной ноге.
 * Поправка заодно даёт то, что и в жизни: невысокий человек, идущий
 * рядом с высоким, переступает чаще.
 */
export function walkTimeScale(walkSpeedMps: number, modelScale: number): number {
  const stride = WALK_CLIP_SPEED_MPS * modelScale
  return stride > 0 ? walkSpeedMps / stride : 1
}

/**
 * Во сколько раз фигура шире в плечах, чем модель из набора.
 *
 * Телосложение в наборе не описано никак: все двадцать одна модель
 * одного сложения. Небольшое растяжение поперёк — единственный способ
 * отличить массивного Марея от тонкокостной Кречетовой, а разница
 * между ними по описаниям такая, что игнорировать её нельзя.
 *
 * Разброс нарочно мал — двенадцать процентов на всё. Больше — и человек
 * начинает выглядеть отражением в кривом зеркале: растягивается ведь
 * и голова тоже.
 */
export function girthScale(build: number): number {
  const clamped = Math.min(1, Math.max(0, build))
  return 0.94 + clamped * 0.12
}

/**
 * Насколько глаза выше и впереди кости `Head`, в метрах.
 *
 * Измерено по мешам глаз всех восьми голов, которые грузит игра. Числа
 * во всех восьми совпадают до миллиметра, и это не совпадение: у набора
 * один скелет на все двадцать одну модель, и голова у всех сидит
 * на одной кости в одном месте. Поэтому отсчёт идёт от кости, а не от
 * коробки головы: коробка у каждой головы своя — в неё входит причёска,
 * а у мужских ещё и шея, — и от неё доля до уровня глаз гуляет
 * от 0.51 до 0.60.
 */
const EYES_ABOVE_HEAD_BONE = 0.101
const EYES_AHEAD_OF_HEAD_BONE = 0.121

/** Толщина и высота оправы. Глаза у моделей набора высотой 26 мм, линза их перекрывает. */
const GLASSES_HEIGHT = 0.03
const GLASSES_DEPTH = 0.022

/** Какую долю ширины головы занимает оправа. */
const GLASSES_WIDTH_SHARE = 0.82

/**
 * Где на голове сидят очки и какого они размера.
 *
 * Положение — от кости головы, ширина — от головы: женская голова уже
 * мужской, а у Долгорукова голова как раз донорская, женская.
 *
 * @param headBone положение кости `Head` в осях фигуры, до масштабирования
 * @param headWidth ширина головы вместе с причёской
 */
export function glassesPlacement(
  headBone: { x: number; y: number; z: number },
  headWidth: number,
): { position: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } {
  return {
    position: {
      x: headBone.x,
      y: headBone.y + EYES_ABOVE_HEAD_BONE,
      z: headBone.z + EYES_AHEAD_OF_HEAD_BONE,
    },
    size: { x: headWidth * GLASSES_WIDTH_SHARE, y: GLASSES_HEIGHT, z: GLASSES_DEPTH },
  }
}
