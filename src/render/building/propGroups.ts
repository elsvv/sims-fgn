import type { PropPlacement } from '../../sim/world/FloorPlan'
import type {
  PropCatalog,
  PropDefinition,
  PropModel,
  PropSize,
  Vec3,
} from '../../sim/world/PropDefinition'

/**
 * Все размещения одного вида предмета, у которого есть модель.
 * Одна группа — один файл, одна геометрия и один набор материалов
 * на все двадцать парт этажа.
 */
export interface PropModelGroup {
  kind: string
  definition: PropDefinition
  model: PropModel
  placements: PropPlacement[]
}

/** Размещение предмета, который рисуется боксом. */
export interface PropBoxItem {
  placement: PropPlacement
  definition: PropDefinition
}

export interface PropRenderPlan {
  /** Виды с моделями, каждый рисуется инстансингом. */
  modelled: PropModelGroup[]
  /** Всё остальное — прежние цветные боксы. */
  boxed: PropBoxItem[]
}

/**
 * Какой моделью рисуется предмет — или null, если боксом.
 *
 * Отсутствие определения в каталоге, отсутствие поля `model` и явное
 * `'box'` дают один и тот же ответ: рисуй боксом. Игра не должна падать
 * ни из-за незаполненного поля, ни из-за незнакомого вида предмета.
 */
export function propModelOf(definition: PropDefinition | undefined): PropModel | null {
  if (!definition) return null
  const model = definition.model
  if (!model || model === 'box') return null
  if (typeof model.url !== 'string' || model.url.length === 0) return null
  return model
}

/**
 * Раскладывает размещения этажа на то, что рисуется моделями, и то, что
 * рисуется боксами.
 *
 * Порядок групп и порядок размещений внутри группы сохраняется от
 * планировки: у инстансов номер — это позиция в списке, и он должен быть
 * устойчивым, иначе от перерисовки к перерисовке предметы будут меняться
 * местами.
 *
 * Предметы, которых нет в каталоге, не рисуются вовсе: их размер
 * неизвестен, а выдумывать его — значит расходиться с навигацией.
 */
export function planPropRender(
  placements: readonly PropPlacement[],
  catalog: PropCatalog,
): PropRenderPlan {
  const modelled: PropModelGroup[] = []
  const byKind = new Map<string, PropModelGroup>()
  const boxed: PropBoxItem[] = []

  for (const placement of placements) {
    const definition = catalog[placement.kind]
    if (!definition) continue

    const model = propModelOf(definition)
    if (!model) {
      boxed.push({ placement, definition })
      continue
    }

    const existing = byKind.get(placement.kind)
    if (existing) {
      existing.placements.push(placement)
      continue
    }

    const group: PropModelGroup = {
      kind: placement.kind,
      definition,
      model,
      placements: [placement],
    }
    byKind.set(placement.kind, group)
    modelled.push(group)
  }

  return { modelled, boxed }
}

/**
 * Где внутри клетки стоит бокс предмета — тот самый, что рисуется вместо
 * не загрузившейся модели и ловит по нему мышь.
 *
 * Считается по тем же полям, что и посадка модели, и потому оказывается
 * там же, где окажется модель: доска, висящая на стене, ловит мышь
 * на стене, а не посреди аудитории. Знать габарит модели для этого
 * не нужно — а значит, бокс можно нарисовать раньше, чем файл загрузится.
 */
export function propBoxOffset(
  size: PropSize,
  model: PropModel | null,
  cellSize: number,
): Vec3 {
  const offset = model?.offset ?? {}
  const back = model?.align === 'back' ? -Math.max(0, (cellSize - size.d) / 2) : 0
  return {
    x: offset.x ?? 0,
    y: size.h / 2 + (offset.y ?? 0),
    z: back + (offset.z ?? 0),
  }
}

/**
 * Все файлы моделей каталога, без повторов. По этому списку делается
 * предзагрузка: доска в аудитории и доска объявлений — один файл,
 * и грузить его дважды не нужно.
 */
export function propModelUrls(catalog: PropCatalog): string[] {
  const urls: string[] = []
  for (const definition of Object.values(catalog)) {
    const model = propModelOf(definition)
    if (model && !urls.includes(model.url)) urls.push(model.url)
  }
  return urls
}
